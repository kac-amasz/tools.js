var sql = require('mssql'),
  fs = require('fs'),
  moment = require('moment'),
  Mustache = require('mustache')

// używanie: raport_rotacje.js ./sciezka/do/konfiguracji.js lataWstecz

var conf = process.argv.length > 2 ? require(process.argv[2]) : require('./config').backup.db,
  years = process.argv.length > 3 ? parseInt(process.argv[3]) : 2

var qPrzych = 'SELECT SUM(ilosc) AS ilosc, DATEDIFF(DD, MAX(dm.dataOperacji), GETDATE()) AS dni' +
  ' FROM TowaryDokumentowMagazynowych tdm' +
  ' INNER JOIN DokumentyMagazynowe dm ON tdm.idDokumentyMagazynowe = dm.id' +
  ' LEFT OUTER JOIN Towary ON Towary.id = tdm.idTowary' +
  ' WHERE dm.anulowany = 0 AND dm.korygowany = 0 AND dm.przychodowy = 1' +
  ' AND dm.dataOperacji >= DATEADD(Month, -{{years}} * 12, GETDATE())' +
  ' AND tdm.idTowary = {{id}} AND dm.typ <> \'RI+\''

var qRozch = 'SELECT SUM(ilosc) AS ilosc' +
  ' FROM TowaryDokumentowMagazynowych tdm' +
  ' INNER JOIN DokumentyMagazynowe dm ON tdm.idDokumentyMagazynowe = dm.id' +
  ' LEFT OUTER JOIN Towary ON Towary.id = tdm.idTowary' +
  ' WHERE dm.anulowany = 0 AND dm.korygowany = 0 AND dm.rozchodowy = 1' +
  ' AND dm.dataOperacji >= DATEADD(Month, -{{years}} * 12, GETDATE())' +
  ' AND tdm.idTowary = {{id}} AND dm.typ <> \'RI-\''


var qStany = 'SELECT Towary.id, MAX(nrKatalogowy) AS nrKatalogowy' +
  ' , SUM(stan) AS stan, MAX(nazwa) AS nazwa, MAX(bazowaCenaZakupuNetto) AS cena' +
  ' FROM dbo.StanyMagazynowe LEFT JOIN dbo.Towary ON idTowary = dbo.Towary.id' +
  ' WHERE stan > 0 GROUP BY Towary.id'


var connection = new sql.Connection(conf, function(err) {
  var req = new sql.Request(connection)
  var w = fs.createWriteStream(moment().format('YYYY-MM-DD_HH-mm-ss') + '_raport-rotacje-' + years + '-lata.csv')
  w.write('id;kat;nazwa;stan;cena;przych;rozch;dni\r\n')
  req.query(qStany, function(err, rs) {
    console.log(err, rs ? rs.length : '')
    var rsi = 0;

    function reqNext() {
      var req = new sql.Request(connection)
      req.multiple = true
      var row = rs[rsi]
      req.query(Mustache.render(qPrzych + ';' + qRozch, {
        id: row.id,
        years: years
      }), function(err, rs2) {
        if (rsi % 100 == 0) console.log(err, rsi, row, rs2)
        w.write([row.id, row.nrKatalogowy, row.nazwa.trim(), row.stan, row.cena, rs2[0][0].ilosc || 0, rs2[1][0].ilosc || 0, rs2[0][0].dni || -1].join(';') + '\r\n')
        rsi++
        if (rsi == rs.length
          //  || rsi==10
        ) {
          w.end()
          return setTimeout(process.exit, 200)
        }
        reqNext()
      })
    }
    reqNext()
  })
})
