var csv = require('csv'),
  fs = require('fs'),
  zlib = require('zlib')

// używanie: node zamien_cennik_na_aktualizacje.js Producent SciezkaDoCennika.csv

var producer = process.argv[2],
  pricingFile = process.argv[3]

var headerLine = 'SYMBOL_MAGAZYNU;NR_KATALOGOWY;NAZWA;ILOSC;JM;CENA_ZAKUPU_NETTO;CENA_SPRZ_NETTO;VATPROC;PKWIU;INDEKS;GRUPA;POD_GRUPA1;POD_GRUPA2;OPIS;UWAGI;DOSTAWCA;PRODUCENT'

var header = headerLine.split(';')

var row = []
for (var i = 0; i < header.length; i++) row.push(i + 1)

// output stream
var out = null

var parserCennik = csv.parse({
  delimiter: ';',
  rtrim: true,
  quote: '~',
})

function periodToComma(s) {
  return s.toString().replace('.', ',')
}

var stream = fs
  .createReadStream(pricingFile)
  .on('open', function(fd) {
    out = fs.createWriteStream(pricingFile + '-aktualizacja.csv')
    out.on('close', function() {
      console.log('out close')
    })
    out.write(row.join(';') + '\r\n')
    out.write(header.join(';') + '\r\n')
    stream = stream.pipe(out)
  })
  .pipe(zlib.createGunzip())
  .pipe(parserCennik)
  .pipe(csv.transform(function(record) {
    if (parserCennik.count == 1) return null
      //  if (parserCennik.count > 10) process.exit()
    var row = Array(header.length)
    row[1] = record[0]
    row[5] = periodToComma(record[6] / 100)
    row[6] = periodToComma(record[3] / 100)
    row[16] = producer
    return row
  }))
  .pipe(csv.stringify({
    delimiter: ';',
    rowDelimiter: 'windows'
  }))
  .on('end', function() {
    out.end()
    setTimeout(process.exit, 200)
  })
