var csv = require('csv');
var fs = require('fs')
var levelup = require('level')
var zlib = require('zlib')

var parser = csv.parse({
  delimiter: ';',
  rtrim: true,
  quote: '~',
})

var to_db = csv.transform(function(record, callback) {
  db.put('c' + record[0], JSON.stringify(record), function(err) {
    callback(err, record)
  })
}).on('finish', function() {
  db.close(function(err) {
    console.log('closed', err)
    setTimeout(process.exit, 500)
  })
})

to_db = csv.transform(function(record) {
  db.put('c' + record[0], record, {
    valueEncoding: 'json'
  }, function(err) {
    if (err) {
      console.log(err)
      throw err
    }
    return true
  })
}).on('finish', function() {
  db.close(function(err) {
    console.log('closed', err)
  })
})


var db = levelup(process.argv[2])

fs
  .createReadStream(process.argv[3]).pipe(zlib.createGunzip())
  .pipe(parser)
  .pipe(csv.transform(function(record) {
    if (parser.count == 1) return null
    return [record[0], record[1], record[3], record[5], record[6]]
  }))
  .pipe(to_db)
