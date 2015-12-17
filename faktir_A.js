var csv = require('csv'),
  through2 = require('through2')

module.exports = readInvoice

var charMap = []
charMap[0xa1] = 'S'
charMap[0xb5] = 'a'
charMap[0xf3] = 'o'
charMap[0x04] = 'A'
charMap[0xd3] = 'O'
charMap[0x18] = 'E'
charMap[0x7b] = 'Z'
charMap[0x5b] = 's'
charMap[0x05] = 'a'
charMap[0xa5] = 'z'
  //charMap[0x93] = 'X' //BXBEN MAÓC
  //charMap[0xb3] = 'o'
charMap[0x07] = 'c'
charMap = charMap.map(function(v) {
  return v.charCodeAt(0)
})

function encodingFixer() {
  return through2(function(chunk, enc, callback) {
    for (var i = 0; i < chunk.length; i++) {
      var c = chunk[i]
        /*
        if (chunk[i] == 0xc2 || chunk[i] == 0xc3) {
          console.log('split')
          chunk = Buffer.concat([chunk.slice(0, i), chunk.slice(i + 1)])
          i -= 1
          continue
        }*/
      c = charMap[c]
      if (c) {
        //var b = chunk.slice(i - 3, i + 10)
        //console.log('got', b, b.toString())
        chunk[i] = c
          //b = chunk.slice(i - 3, i + 20)
          //console.log('sub', b, b.toString())
      }
      // c = chunk[i]
      // if (c != 0x00 && c != 0x0a && c != 0x0d && c != 0x09 && c != 0x20 && (c < 0x2c || c > 0x7a)) {
      //   var b = chunk.slice(i - 3, i + 10)
      //   console.log('got', b, b.toString())
      // }
    }
    this.push(chunk)
    callback()
  })
}

function makeTransformer(parser) {
  return csv.transform(function(record) {
    //console.log(record.length)
    if (record.length < 2) return null
    if (parser.count == 1) return record

    record[2] = record[2].replace(/ /g, '')
    for (var i in a = [4, 6, 7, 9, 10, 11, 12])
      record[a[i]] = parseFloat(record[a[i]].replace(/\./g, '').replace(',', '.'))
      //  throw new Error('bang!')
    return record
  })
}

function readRows(stream, callback) {
  var parser = csv.parse({
    delimiter: '\t',
    trim: true,
  })

  var g_err = null,
    g_rows = []

  function handleErr(err) {
    console.log('err', err)
    g_err = err
    stream.emit('end')
  }

  function handleEnd() {
    console.log('end')
    callback(g_err, g_rows)
  }

  stream
    .on('error', handleErr).on('end', handleEnd)
    .pipe(encodingFixer()).on('error', handleErr)
    .pipe(parser).on('error', handleErr)
    .pipe(makeTransformer(parser)).on('error', handleErr)
    .on('data', function(data) {
      g_rows.push(data)
    })
}

function makeInvoice(rows) {
  var invoice = {}
  invoice.recs = []
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i]
    var rec = {}
    if (i == 1) {
      invoice.id = row[0]
    } else {
      if (row[0] != invoice.id) throw new Error('invoice id doesn\'t match, ' + invoice.id + ', ' + row[0])
    }
    rec.id = row[2]
    rec.name = row[3]
    rec.count = row[4]
    rec.unit = row[5]
    rec.price = row[6]
    rec.currency = row[8]
    rec.vat = row[9]
    rec.weight = row[11]
    rec.weightUnit = row[13]
    rec.orderNumber = row[17]
    invoice.recs.push(rec)
  }
  return invoice
}

function standarize(invoice) {
  invoice.deliveryIdx = -1
  var currency = null
  for (var i in invoice.recs) {
    var r = invoice.recs[i]
    if (r.count % 1) throw new Error('count not an integer, ' + r.count)
    if (currency == null) {
      currency = r.currency
    } else if (currency != r.currency) {
      throw new Error('multiple currencies in invoice, ' + currency + ', ' + r.currency)
    }
    r.price = Math.round(r.price * 100)
    r.vat = Math.round(r.vat * 100)
    var value = r.price * r.count
    r.taxRate = Math.round(r.vat * 1000 / (value)) / 10
    if (r.id == 'ERF1' && r.name == 'Koszt transportu') {
      if (invoice.deliveryIdx != -1) throw new Error('multiple deliveries in invoice')
      invoice.deliveryIdx = i
    }
  }
}

function readInvoice(stream, doStandarize, callback) {
  return readRows(stream, function(err, rows) {
    if (err) return callback(err)
    try {
      var invoice = makeInvoice(rows)
      if (doStandarize) standarize(invoice)
      callback(null, invoice)
    } catch (err) {
      return callback(err)
    }
  })
}

if (!module.parent) {
  var path = require('path'),
    fs = require('fs'),
    async = require('async')

  var filesWithDelivery = ['01.csv',
    '06.csv',
    '13.csv',
    '21.csv',
    '23.csv',
    '25.csv',
    '28.csv'
  ]

  var baseDir = path.join(__dirname, 'testData', 'faktir')
  if (true)
    readInvoice(fs.createReadStream(path.join(baseDir, filesWithDelivery[5])), true, function(err, invoice) {
      if (invoice.deliveryIdx != -1) {
        var deliveryRec = invoice.recs.splice(invoice.deliveryIdx)[0]
        solver = require('./faktir_solver')
        solver(invoice.recs, deliveryRec.count * deliveryRec.price)
        delete invoice.deliveryIdx
        console.log(invoice)
      }
    })

  if (false)
    fs.readdir(baseDir, function(err, files) {
      if (err) throw new Error(err)
      var filesWithDelivery = []
      var out = fs.createWriteStream('/tmp/sum.csv', {
        encoding: 'ascii'
      })
      var stringify = csv.stringify()
      stringify.pipe(out)

      async.eachSeries(files, function(file, callback) {
        var stream = fs
          .createReadStream(path.join(baseDir, file), {
            encoding: null
          })
        readRows(stream, function(err, rows) {
          if (err) return callback(err)
          for (var r in rows) stringify.write(rows[r])
            //console.log(makeInvoice(rows))
          callback()
        })
      }, function(err) {
        console.log('done', err)
        out.end()
        console.log('with delivery', filesWithDelivery)
          // csv.stringify(allrows, function(err, output){
          //   fs.writeFile('/tmp/sum.csv', output, 'ascii')
          // })
      })
    })
}
