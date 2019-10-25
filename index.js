const request = require('request');
const fs = require('fs');
const cheerio = require('cheerio')
const Koa = require('koa')
const app = new Koa()
const bodyParser = require('koa-bodyparser')

const port = 3001
let mainDNS = 'http://diechu.dh.cx/'

app.use(bodyParser())

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
    await getLogistics()
    console.log('====================================');
    console.log(postData);
    console.log('====================================');
  }

})

async function getLogistics() {
  let mainRes = await promiseRequest({
    url: mainDNS,
    method: "POST",
    form: {
      query_str: '13996897837',
      action: 'home_query'
    }
  })

  if (mainRes.statusCode !== 200) {
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
    body: endRes.body
  }
}

function promiseRequest(reqParams, timeout = 100) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
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
    }, timeout);
  });
}

app.listen(port, () => {
  console.log(`koa server is running at ${port}`);
})