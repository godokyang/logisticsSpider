const request = require('request');
const fs = require('fs');
const cheerio = require('cheerio')
const path = require('path')
const Koa = require('koa')
const readline = require('readline');
const app = new Koa()
const bodyParser = require('koa-bodyparser')
const static = require('koa-static')
const cors = require('koa2-cors')

const port = 3001
// let mainDNS = 'http://diechu.dh.cx/'
// 静态资源目录对于相对入口文件index.js的路径
// 13668126060
// 1399689837
const staticPath = './static'

app.use(bodyParser())
app.use(static(
  //path.join(__dirname, staticPath)
  path.join(`${__dirname}`, staticPath)
))
app.use(cors({
  origin: function (ctx) {
    return "*";
  },
  exposeHeaders: ['WWW-Authenticate', 'Server-Authorization'],
  maxAge: 5,
  credentials: true,
  allowMethods: ['GET', 'POST', 'DELETE', 'PUT'], //设置允许的HTTP请求类型
  allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
}))

app.use(async (ctx) => {
  let reg = new RegExp(/^\/\?/)
  if (reg.test(ctx.url) && ctx.url === '/' && ctx.method === 'GET') {
    let html = fs.readFileSync('search.html', 'UTF-8')
    ctx.body = html
  }

  if (ctx.url === '/back' && ctx.method === 'GET') {
    let html = fs.readFileSync('data.html', 'UTF-8')
    ctx.body = html
  }

  if (ctx.url === '/getlist' && ctx.method === 'GET') {
    ctx.response.body = {
      statusCode: 200,
      data: await returnUriList()
    }
  }

  if (ctx.url === '/add' && ctx.method === 'PUT') {
    let postData = ctx.request.body
    let logisticsList = await readFileToArr('config.json')
    logisticsList.push(postData.addtext)
    fs.appendFileSync('config.json', `\n${postData.addtext}`)
    ctx.response.body = {
      statusCode: 200,
      data: await returnUriList()
    }
  }

  if (ctx.url === '/remove' && ctx.method === 'DELETE') {
    let logisticsList = await readFileToArr('config.json')
    let postData = ctx.request.body
    let str = ''
    for (let index = 0; index < logisticsList.length; index++) {
      const element = logisticsList[index];
      if (element === postData.removetext || !element.replace(/\s*/g, "")) {
        continue
      }
      if (str) {
        str += '\n'
      }
      str += element
    }
    fs.writeFileSync('config.json', str);
    ctx.response.body = {
      statusCode: 200,
      data: await returnUriList()
    }
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
      let uri = element.replace(/\s*/g, "");
      if (!uri) {
        return
      }
      let res = await getLogistics(uri, postData.searchText)
      if (res.status) {
        responseObj.head = responseObj.head.concat(res.head)
        responseObj.body = responseObj.body.concat(res.body)
        responseObj.count = responseObj.body.length
      }
    }

    if (responseObj.count) {
      ctx.response.body = Object.assign({ statusCode: 200 }, responseObj)
    } else {
      ctx.response.body = { statusCode: 400 }
    }
  }

})

async function returnUriList(list) {
  let logisticsList = list ? list : await readFileToArr('config.json')
  let oHtml = '<select id="selector">'
  for (let index = 0; index < logisticsList.length; index++) {
    const element = logisticsList[index];
    oHtml += `<option ${index === 0 ? 'selected' : ''}>${element}</option>`
  }
  oHtml += '</select>'
  return oHtml
}

async function getLogistics(mainDNS, searchText) {
  console.log(mainDNS, searchText)
  let courierURI = `${mainDNS}${searchText}`
  let keyStr = '.dh.cx/'
  if (mainDNS.lastIndexOf(keyStr) === (mainDNS.length - keyStr.length)) {
    let mainRes = await promiseRequest({
      url: mainDNS,
      method: "POST",
      form: {
        query_str: searchText,
        action: 'home_query'
      },
      followRedirect: false,
      followAllRedirects: true
    })

    if (mainRes.statusCode !== 200 || !JSON.parse(mainRes.body) || JSON.parse(mainRes.body).data.length === 0) {
      return {
        status: false
      }
    }
    courierURI = JSON.parse(mainRes.body).data[0]
  }


  let courierRes = await promiseRequest(courierURI)
  if (courierRes.statusCode !== 200) {
    return {
      status: false
    }
  }
  let $ = cheerio.load(courierRes.body, {
    normalizeWhitespace: true,
    decodeEntities: false
  });

  let noList = []
  let resObj = {
    status: false,
    head: [],
    body: []
  }
  // 快递单号所在节点集合
  resObj.head.push($('.panel-body').html())
  if ($('.panel-box').text().indexOf('多条记录') !== -1) {
    $('.panel-box').find('a').each(async (i, ele) => {
      if ($(ele).text().indexOf('单号') !== -1) {
        let cp = $(ele).clone().text()
        let strArr = cp.split('单号')
        let no = strArr[strArr.length - 1].replace(/[^0-9]/ig, "");
        noList.push(no)
        if (i > 0) {
          let headerRes = await promiseRequest(`${courierURI}/${i}`)
          if (headerRes.statusCode === 200) {
            let inner = cheerio.load(headerRes.body, {
              normalizeWhitespace: true,
              decodeEntities: false
            })
            resObj.head.push(inner('.panel-body').html())
          } else {
            resObj.head.push('<view>非有效数据</view>')
          }
        }
      }
    })
  } else {
    $('.panel-body').find('li').each(function (i, ele) {
      if ($(ele).text().indexOf('单号') !== -1) {
        let cp = $(ele).clone()
        cp.find(':nth-child(n)').remove()
        noList.push(cp.text().replace(/[^0-9]/ig, ""))
      }
    })
  }
  resObj.head = [...new Set(resObj.head)]
  noList = [...new Set(noList)]
  if (noList.length === 0) {
    return {
      status: false
    }
  }

  for (let index = 0; index < noList.length; index++) {
    const element = noList[index];
    if (!element) {
      continue
    }
    let endPost = {
      url: "http://apis.dh.cx/query/json",
      method: 'POST',
      form: {
        no: element,
        company: 'unknown'
      }
    }
    let endRes = await promiseRequest(endPost)
    if (endRes.statusCode === 200) {
      resObj.status = true
      resObj.body.push(JSON.parse(endRes.body))
    }
  }

  return resObj
}

function promiseRequest(reqParams, timeout = 100) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        // console.log('url:  ',reqParams)
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
      let fRead = fs.createReadStream(fReadName);
      let objReadline = readline.createInterface({
        input: fRead
      });
      let arr = new Array();
      objReadline.on('line', function (line) {
        arr.push(line);
        //console.log('line:'+ line);
      });
      objReadline.on('close', function () {
        // console.log(arr);
        resolve(arr);
      });
      objReadline = null
    } catch (error) {
      reject(error)
    }

  })
}

app.listen(port, () => {
  console.log(`koa server is running at ${port}`);
})
