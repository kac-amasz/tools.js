var express = require('express'),
  path = require('path'),
  fs = require('fs'),
  util = require('util'),
  streamBuffers = require('stream-buffers'),
  Mustache = require('mustache'),
  async = require('async'),
  faktir_solver = require('./faktir_solver'),
  logger = require('morgan'),
  bodyParser = require('body-parser')

var app = express()
app.set('view engine', 'jade')
app.set('views', __dirname + '/views')
app.use(express.static(__dirname + '/public'))
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*")
    //  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
  next()
})
app.use(logger('dev'))
app.use(bodyParser.text({limit: '10mb'}))

app.get('/', function(req, res) {
  res.render('faktir_test', {
    useReload: typeof(config.useReload) !== 'undefined' ? config.useReload : false
  })
})

app.get('/fakt/:num', function(req, res) {
  console.log(req.params)
  var num = parseInt(req.params.num)
  if (isNaN(num)) {
    res.end('bad num: ' + req.params.num)
  } else {
    num = '' + num
    if (num.length < 2) num = '0' + num
    fs.createReadStream(path.join(__dirname, 'testData', 'faktir', num + '.csv'))
      .on('error', function(err) {
        console.log(err)
        res.status(500).send(err.toString())
      })
      .pipe(res)
  }
})

var subAppCache = {}

function fetchParts(recs, callback) {
  if (parentApp) {
    async.each(recs, function(rec, callback) {
      console.log('get ' + rec.id)
      parentApp.getPart(rec.id, function(err, data) {
        console.log(err ? err.toString() : undefined, data)
        if (data) {
          rec.name = data.name
          rec.priceSell = data.priceMax * 100
        }
        callback()
      })
    }, function(err) {
      callback(err, recs)
    })
  } else {
    callback(null, null)
  }
}

app.post('/process/:type', function(req, res) {
  var type = req.params.type
  var match = type.match(/^[A-Z0-9]+$/)
  if (!match) return res.status(404).end('Not found')
  var subApp = subAppCache.hasOwnProperty(type)
  if (!subApp) {
    try {
      subAppCache[type] = subApp = require(__dirname + '/faktir_' + type)
    } catch (err) {
      console.log('loading ' + type, err)
      subAppCache[type] = null
    }
  } else {
    subApp = subAppCache[type]
  }
  if (subApp) {
    var rstream = new streamBuffers.ReadableStreamBuffer()
    rstream.put(new Buffer(req.body, 'hex'))
    rstream.stop()
    subApp(rstream, true, function(err, invoice) {
      if (err) return res.json({
        err: err.toString()
      })
      if (invoice.deliveryIdx != -1) try {
        var cost = invoice.recs.splice(invoice.deliveryIdx)[0]
        faktir_solver(invoice.recs, cost.price * cost.count)
      } catch (err) {
        return res.json({
          err: err.toString()
        })
      }
      fetchParts(invoice.recs, function(err, recs) {
        var stream = new streamBuffers.WritableStreamBuffer()
        stream.on('finish', function() {
          res.json({
            invoiceId: encodeURIComponent(invoice.id),
            contentBase64: stream.getContentsAsString('base64'),
          })
        })
        require(__dirname + '/faktir_template_A')(invoice, stream)
      })
    })
  } else {
    return res.end('nok')
  }
})

app.get('/faktir_A.user.js', function(req, res) {
  fs.readFile(path.join(__dirname, 'public', 'js', 'faktir_A.js'), 'utf8',
    function(err, txt) {
      if (err) return res.end('error')
      res.end(Mustache.render(txt, {
        serverUrl: req.protocol + '://' + req.headers.host + req.baseUrl + '/',
        NL: '\n',
        include: config ? config.A.pluginInclude : null,
        plugin: true,
      }))
    })
})

var parentApp = null

app.on('mount', function(parent) {
  console.log('faktir mounted')
  parentApp = parent
})

var config = {}
app.setConfig = function(cfg) {
  config = cfg
  return this
}

module.exports = app
