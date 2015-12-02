var express = require('express'),
  http = require('http'),
  path = require('path'),
  reload = require('reload'),
  bodyParser = require('body-parser'),
  logger = require('morgan'),
  levelup = require('level'),
  sprintf = require('sprintf-js')

var conf = require('./env.json')[process.env.NODE_ENV || 'prod']
console.log(conf)
var db = levelup(process.argv[2])
var app = express()

var publicDir = path.join(__dirname, '')

function zeroFill(v, n) {
  var s = '' + v
  while (s.length < n) s = '0' + s
  return s
}

app.set('port', process.env.PORT || 3000)
app.set('view engine', 'jade')
app.set('views', path.join(__dirname, 'views'))
app.use(express.static(__dirname + '/public'))
  //app.use('/static', express.static(__dirname + '/public'));
app.use(logger('dev'))
app.use(bodyParser.json()) //parses json, multi-part (file), url-encoded
app.use(bodyParser.urlencoded())



app.get('/', function(req, res) {
  res.render('orders', {
    title: 'kosztorysy',
    message: 'Hello there!',
    useReload: conf.useReload
  });
})

function rowToPart(row) {
  return {
    id: row[0],
    name: row[1],
    priceMax: row[2] / 100,
    priceMin: row[4] / 100
  }
}

app.get('/part/:id', function(req, res) {
  var id = req.params.id.toUpperCase()
    //if (!/^A-Z/.test(id)) id = zeroFill(id, 10)
  id = zeroFill(id, 10)
  db.get('c' + id, {
    valueEncoding: 'json'
  }, function(err, value) {
    res.json({
      err: err ? err.toString() : undefined,
      value: value ? rowToPart(value) : undefined
    })
  })
})

function saveOrder(order, callback) {
  var latestKey = 'order_latest/' + order.created
  var orderKey = 'order_data/' + order.created + '/start/' + order.updated
  console.log('save', order, typeof(order))
  return db.batch()
    .put(latestKey, {
      name: order.name,
      updated: order.updated
    }, {
      valueEncoding: 'json'
    })
    .put(orderKey, order, {
      valueEncoding: 'json'
    })
    .write(callback)
}

app.post('/order', function(req, res) {
  var order = req.body
  if (!order.created) return res.json({
    err: 'brak daty utworzenia'
  })
  if (!order.updated) return res.json({
    err: 'brak daty modyfikacji'
  })
  if (!order.name) return res.json({
    err: 'brak nazwy'
  })
  var latestKey = 'order_latest/' + order.created
  db.get(latestKey, function(err, data) {
      if (err) {
        console.log(err.name)
        if (err.name == 'NotFoundError') {
          return saveOrder(order, function(err) {
            res.json({
              err: err ? err.toString() : undefined
            })
          })
        }
        return res.json({
          err: err.toString()
        })
      }
      console.log('istniejący wpis:', data, typeof(data))

      return res.json({
        err: 'wpis istnieje'
      })
    })
    //console.log(req.body)
})

app.put('/order', function(req, res) {
  var order = req.body
  if (!order.created) return res.json({
    err: 'brak daty utworzenia'
  })
  if (!order.updated) return res.json({
    err: 'brak daty modyfikacji'
  })
  if (!order.name) return res.json({
    err: 'brak nazwy'
  })
  saveOrder(order, function(err) {
    res.json({
      err: err ? err.toString() : undefined
    })
  })
})

app.get('/orders', function(req, res) {
  var records = []
  var gErr = null
  db.createReadStream({
      gt: 'order_latest/',
      lt: req.query.from ? 'order_latest/' + req.query.from : 'order_latest/9',
      reverse: true,
      limit: 10,
      valueEncoding: 'json',
    }).on('data', function(data) {
      records.push({
        created: data.key.substring(data.key.indexOf('/') + 1),
        updated: data.value.updated,
        name: data.value.name
      })
    })
    .on('error', function(err) {
      console.log(err.stack)
      gErr = err
    })
    .on('end', function() {
      res.json({
        err: gErr,
        value: records
      })
    })
})

app.get('/orders/clear', function(req, res) {
  db.createReadStream({
    gt: 'order_latest/',
    lt: 'order_latest/9',
    //reverse: true,
    //limit: 10,
    values: false,
  }).on('data', function(data) {
    //console.log('del',data)
    db.del(data)
  }).on('end', function() {
    res.send('ok')
  })
})

app.get('/order/:created/:updated', function(req, res) {
  var orderKey = 'order_data/' + req.params.created + '/start/' + req.params.updated
  db.get(orderKey, {
    valueEncoding: 'json'
  }, function(err, data) {
    console.log(data, typeof(data))
    return res.json({
      err: err ? err.toString() : undefined,
      value: data
    })
  })
})

function formatCurrency(value) {
  var s = "";

  function take(div, sep, prec) {
    var v = (value / div) | 0;
    var vv = "" + v;
    if (s.length > 0) {
      while (vv.length < prec)
        vv = "0" + vv;
      s += vv + sep;
    } else if (v > 0) {
      s += vv + sep;
    }
    value %= div;
  }
  take(1000000 * 100, ".", 3)
  take(1000 * 100, ".", 3)
  take(100, ",", 3)
  take(1, "", 2)
  if (s.length == 0) {
    s = "0"
  }
  return s
}

function printOrder(req, res, data) {
  var records = []
  var value = 0
  for (var r in data.records) {
    r = data.records[r]
    records.push({
      id: r.part.id,
      name: r.part.name,
      count: r.count,
      price: r.price,
      value: formatCurrency(r.price * r.count * 100)
    })
    value += r.price * r.count
  }

  res.render('order_print', {
    title: 'kosztorysy',
    message: 'Hello there!',
    useReload: conf.useReload,
    records: records,
    value: formatCurrency(value * 100),
    valueGross: formatCurrency(value * 123)
  })
}

function exportOrder(req, res, data) {
  var records = []
  var taxRate = 23
  for (var r in data.records) {
    var idx = parseInt(r)
    r = data.records[r]
    var tax = Math.round(r.price * taxRate) / 100
    records.push({
      number: idx+1,
      id: r.part.id,
      name: r.part.name,
      count: sprintf.sprintf('%.2f', r.count),
      price: sprintf.sprintf('%.2f', r.price),
      priceGross: sprintf.sprintf('%.2f', r.price + tax),
      taxRate: '23.00',
      unit: 'szt.',
      amount: sprintf.sprintf('%.2f', r.price * r.count),
      amountTax: sprintf.sprintf('%.2f', tax * r.count),
    })
  }
  res.set('Content-Type', 'application/xml')
  res.render('order_export', {
    title: 'kosztorysy',
    records: records,
  })
}

app.get('/order/print/:created/:updated', function(req, res) {
  var orderKey = 'order_data/' + req.params.created + '/start/' + req.params.updated
  db.get(orderKey, {
    valueEncoding: 'json'
  }, function(err, data) {
    if (err) return res.json({
      err: err.toString()
    })
    console.log(data, typeof(data))
    printOrder(req, res, data)
  })
})

app.get('/order/export/:created/:updated', function(req, res) {
  var orderKey = 'order_data/' + req.params.created + '/start/' + req.params.updated
  db.get(orderKey, {
    valueEncoding: 'json'
  }, function(err, data) {
    if (err) return res.json({
      err: err.toString()
    })
    exportOrder(req, res, data)
  })
})

app.post('/order/print', function(req, res) {
  printOrder(req, res, req.body)
})

app.post('/order/export', function(req, res) {
  exportOrder(req, res, req.body)
})

app.post('/order/export2', function(req, res){
  res.set('Content-disposition', 'attachment; filename='+req.body.fileName)
  var order = JSON.parse(req.body.order)
  exportOrder(req, res, order)
})

app.get('/part/find/:id', function(req, res) {
  var id = req.params.id.toUpperCase()
  res.write('[')
  var hasFirst = false
  db.createReadStream({
      gt: 'c',
      lt: 'd',
      values: false
    })
    .on('data', function(data) {
      if (data.indexOf(id) != -1) {
        res.write((hasFirst ? ',' : '') + JSON.stringify(data))
        hasFirst = true
      }
    })
    .on('end', function() {
      //console.log('end')
      res.end(']')
    })
})



var server = http.createServer(app)


if (conf.useReload) {
  //reload code here
  //optional reload delay and wait argument can be given to reload, refer to [API](https://github.com/jprichardson/reload#api) below
  //reload(server, app)// [reloadDelay], [wait])
  reload(server, app, 200, true)
}

server.listen(app.get('port'), function() {
  console.log("Web server listening on port " + app.get('port'));
});
