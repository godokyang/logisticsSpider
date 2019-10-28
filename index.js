const request = require('request');
const fs = require('fs');
const cheerio = require('cheerio')
const path = require('path')
const Koa = require('koa')
const readline = require('readline');
const app = new Koa()
const bodyParser = require('koa-bodyparser')
const static = require('koa-static')

const port = 3001
// let mainDNS = 'http://diechu.dh.cx/'
// 静态资源目录对于相对入口文件index.js的路径
const staticPath = './static'

app.use(bodyParser())
app.use(static(
  path.join(__dirname, staticPath)
))

app.use(async (ctx) => {
  if (ctx.url === '/search' && ctx.method === 'GET') {
    let html = fs.readFileSync('search.html', 'UTF-8')
    ctx.body = html
    // return html
  }

  if (ctx.url === '/data' && ctx.method === 'GET') {

  }

  if (ctx.url === '/search' && ctx.method === 'POST') {
    let postData = ctx.request.body
    console.log('====================================');
    console.log(postData);
    console.log('====================================');
    let logisticsList = await readFileToArr('config.json')
    let responseObj = {
      count: 0,
      head: [],
      body: []
    }

    for (let index = 0; index < logisticsList.length; index++) {
      const element = logisticsList[index];
      let uri = element.replace(/\s*/g,"");
      if (!uri) {
        return
      }
      let res = await getLogistics(uri, postData.searchText)
      if (res.status) {
        responseObj.count++
        responseObj.head.push(res.head)
        responseObj.head.push(res.body)
      }
    }
    console.log('==============222222======================');
    console.log(responseObj);
    console.log('====================================');
    if (responseObj.status) {
      ctx.response.body = Object.assign({ statusCode: 200 }, responseObj)
    } else {
      ctx.response.body = { statusCode: 400 }
    }
  }

})

async function getLogistics(mainDNS,searchText) {
  console.log(mainDNS, searchText)
  let mainRes = await promiseRequest({
    url: mainDNS,
    method: "POST",
    form: {
      query_str: searchText,
      action: 'home_query'
    }
  })

  console.log('====================================');
  console.log(mainRes.body);
  console.log('====================================');
  if (mainRes.statusCode !== 200 || !JSON.parse(mainRes.body) || JSON.parse(mainRes.body).data.length === 0) {
    return {
      status: false
    }
  }

  let courierRes = await promiseRequest(JSON.parse(mainRes.body).data[0])
  if (courierRes.statusCode !== 200) {
    return {
      status: false
    }
  }
  let $ = cheerio.load(courierRes.body, {
    normalizeWhitespace: true,
    decodeEntities: false
  });

  let infoHtml = $('.panel-body').html()
  let noList = []
  // 快递单号所在节点集合
  $('.panel-body').find('li').each(function (i, ele) {
    if ($(ele).text().indexOf('快递单号') !== -1) {
      let cp = $(ele).clone()
      cp.find(':nth-child(n)').remove()
      noList.push(cp.text().replace(/[^0-9]/ig, ""))
    }
  })

  if (!noList[0]) {
    return {
      status: false
    }
  }

  let endPost = {
    url: "http://apis.dh.cx/query/json",
    method: 'POST',
    form: {
      no: noList[0],
      company: 'unknown'
    }
  }

  let endRes = await promiseRequest(endPost)
  return {
    status: true,
    head: infoHtml,
    body: JSON.parse(endRes.body)
  }
}

function promiseRequest(reqParams, timeout = 100) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        console.log('url:  ',reqParams)
        request(reqParams, function (error, response, body) {
          if (error || response.statusCode !== 200) {
            reject({
              error: error,
              response: response
            })
            return
          }
          resolve(response)
        })
      } catch (error) {
        resolve(error)
      }

    }, timeout);
  });
}

/*
* 按行读取文件内容
* 返回：字符串数组
* 参数：fReadName:文件名路径
*      callback:回调函数
* */
function readFileToArr(fReadName) {
  return new Promise((resolve, reject) => {
    try {
      var fRead = fs.createReadStream(fReadName);
      var objReadline = readline.createInterface({
        input: fRead
      });
      var arr = new Array();
      objReadline.on('line', function (line) {
        arr.push(line);
        //console.log('line:'+ line);
      });
      objReadline.on('close', function () {
        // console.log(arr);
        resolve(arr);
      });
    } catch (error) {
      reject(error)
    }

  })
}

app.listen(port, () => {
  console.log(`koa server is running at ${port}`);
})