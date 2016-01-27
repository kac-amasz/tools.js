var m_q1 = "SELECT MAX(NazwaTowaru) AS Nazwa, NrKatalogowyTowaru as NrKatalogowy, SUM(Stan) AS Stan" +
  " FROM Fn_raport_magazynowy_stany('{{timestamp}}')" +
  " WHERE idmagazyny = {{warehouseId}} GROUP BY NrKatalogowyTowaru HAVING SUM(Stan) > 0 ORDER BY Nazwa"
  // warehouseId, dateFrom(2015-10-31T23:59:59.000), dateTo
var m_q2 = "SELECT RM.NazwaTowaru AS Nazwa, RM.NrKatalogowyTowaru AS NrKatalogowy, COALESCE(Max(przych_rozch.rozchod), 0) AS rozch_ilosc" +
  " FROM  raport_magazynowy AS RM" +
  " LEFT JOIN (SELECT idmagazyny , IdTowary , Sum(przychod) AS przychod" +
  ", dbo.Fn_zaokr(Sum(przychodnetto)) AS przychodNetto, Sum(rozchod) AS rozchod" +
  ", dbo.Fn_zaokr(Sum(rozchodnetto))  AS rozchodNetto" +
  " FROM raport_magazynowy WHERE data BETWEEN '{{dateFrom}}' AND '{{dateTo}}'" +
  " AND idmagazyny = 3 GROUP BY idmagazyny, IdTowary)" +
  " AS przych_rozch ON ((przych_rozch.idmagazyny = RM.idmagazyny )" +
  " OR ( przych_rozch.idmagazyny IS NULL AND RM.idmagazyny IS NULL ) )" +
  " AND ( ( przych_rozch.IdTowary = RM.IdTowary )" +
  " OR ( przych_rozch.IdTowary IS NULL AND RM.IdTowary IS NULL ) )" +
  " WHERE data BETWEEN '{{dateFrom}}' AND '{{dateTo}}'" +
  " AND (RM.typDM IN ('WZ', 'WZK', 'RW', 'RWK', 'MM-', 'RI-', 'KK'))" +
  " GROUP BY RM.IdMagazyny, RM.nazwamagazynu,RM.NazwaTowaru, RM.NrKatalogowyTowaru" +
  " HAVING ( COALESCE(Max(przych_rozch.rozchod), 0) <> 0" +
  " OR COALESCE(Max(przych_rozch.rozchodnetto), 0) <> 0 )" +
  " ORDER  BY RM.nazwamagazynu , RM.NazwaTowaru"

var sql = require('mssql')
var Mustache = require('mustache')
var moment = require('moment')
var jsonfile = require('jsonfile')
var fs = require('fs')
var path = require('path')
var util = require('util')
var async = require('async')
var common = require('./common')

function formatQuery(date, warehouseId) {
  return Mustache.render(m_q1, {
    timestamp: moment(date).subtract(1, 's').format('YYYY-MM-DDTHH:mm:ss.SSS'),
    warehouseId: warehouseId,
  })
}

function formatQuery2(dateFrom, dateTo, warehouseId) {
  return Mustache.render(m_q2, {
    dateFrom: moment(dateFrom, 'YYYY-MM-DD').subtract(1, 's').format('YYYY-MM-DDTHH:mm:ss.SSS'),
    dateTo: moment(dateTo, 'YYYY-MM-DD').subtract(1, 's').format('YYYY-MM-DDTHH:mm:ss.SSS'),
    warehouseId: warehouseId
  })
}

function plComp(a, b) {
  //var alph = 'AĄBCĆDEĘFGHIJKLŁMNŃOÓPRSŚTUWXYZŹŻaąbcćdeęfghijklłmnńoóprsśtuwxyzźż'
  a = a.toLowerCase()
  b = b.toLowerCase()
  var alph = 'aąbcćdeęfghijklłmnńoóprsśtuwxyzźż'

  function cmp(a, b) {
    return a > b ? 1 : a < b ? -1 : 0
  }
  var len = Math.min(a.length, b.length)
  var i = 0
  var ac, bc
  while ((ac = a.charAt(i)) == (bc = b.charAt(i)) && i < len) {
    i++
  }
  if (i == len) return a.length - b.length
  var ai = alph.indexOf(ac),
    bi = alph.indexOf(bc)
  if (ai == -1 || bi == -1) {
    return ai == bi ? cmp(ac, bc) : ai == -1 ? cmp(ac, 'a') : cmp('a', bc)
  }
  return ai - bi
}

function getBalances(ctx, callback) {
  var date = moment(ctx.date, 'YYYY-MM-DD')
  ctx.dates = new Array(ctx.conf.reports.steps)
  ctx.dbQuery = ''
  for (var i = 0; i < ctx.conf.reports.steps; i++) {
    //ctx.dates[i]
    var dateTo = date.format('YYYY-MM-DD')
    ctx.dates[i] = date.subtract(ctx.conf.reports.monthsToStep, 'months').format('YYYY-MM-DD')
    ctx.dbQuery += formatQuery2(ctx.dates[i], dateTo, ctx.warehouseId) + ';'
  }
  ctx.dbQuery += formatQuery(ctx.date, ctx.warehouseId) + ';'
  if (ctx.testMode) {
    jsonfile.readFile('testData/recordsets0.json', function(err, recordsets) {
      ctx.recordsets = recordsets
      if (callback) callback(err, ctx)
    })
    return
  }
  var req = new sql.Request(ctx.conn)
  req.multiple = true
  req.query(ctx.dbQuery, function(err, recordsets) {
    //jsonfile.writeFileSync('testData/recordsets0.json', recordsets)
    ctx.recordsets = recordsets
    if (callback) callback(err, ctx)
  })
}

function saveRecordsets(ctx, callback) {
  jsonfile.writeFile('testData/recordsets0.json', ctx.recordsets, function(err) {
    if (callback) callback(err, ctx)
  })
}

function Record(NrKatalogowy, Nazwa, steps) {
  this.NrKatalogowy = NrKatalogowy
  this.Nazwa = Nazwa
  this.Rozchody = []
  for (var i = 0; i < steps; i++) {
    this.Rozchody[i] = 0
  }
  this.Stan = 0
}

function processBalances(ctx, callback) {
  try {
    var records = {}
    for (var rsi = 0; rsi < ctx.conf.reports.steps; rsi++) {
      var rs = ctx.recordsets[rsi]
      for (var i = 0; i < rs.length; i++) {
        var r = rs[i]
        var rec = records[r.NrKatalogowy]
        if (!rec) {
          rec = records[r.NrKatalogowy] = new Record(r.NrKatalogowy, r.Nazwa, ctx.conf.reports.steps)
        }
        rec.Rozchody[rsi] = r.rozch_ilosc
      }
    } {
      var rs = ctx.recordsets[ctx.recordsets.length - 1]
      for (var i = 0; i < rs.length; i++) {
        var r = rs[i]
        var rec = records[r.NrKatalogowy]
        if (!rec) {
          rec = records[r.NrKatalogowy] = new Record(r.NrKatalogowy, r.Nazwa, ctx.conf.reports.steps)
        }
        rec.Stan = r.Stan
      }
    }
    var sort = []
    for (var nr in records) {
      if (ctx.conf.reports.exclude.indexOf(records[nr].NrKatalogowy) == -1)
        sort.push(records[nr])
    }
    sort.sort(function(a, b) {
      var r = plComp(a.Nazwa, b.Nazwa);
      if (r == 0) r = a.NrKatalogowy > b.NrKatalogowy ? 1 : -1
      return r
    })

    ctx.rows = sort
    if (callback) callback(null, ctx)
  } catch (err) {
    if (callback) callback(err, ctx)
  }
}

function renderRows(ctx, callback) {
  var outFile = path.join(ctx.conf.reports.directory, ctx.created + '_3lata.txt')
  fs.readFile(path.join(__dirname, 'raport_3lata_csv0.mst'), 'utf8', function(err, tpl) {
    if (err) {
      if (callback) callback(err, ctx)
      return
    }
    fs.writeFile(outFile, Mustache.render(tpl, {
      created: moment().toISOString(),
      dates: ctx.dates,
      rows: ctx.rows,
      date: ctx.date
    }), function(err) {
      if (!err) {
        ctx.outFile = outFile
        ctx.outFileContentType = 'text/plain; charset=UTF-8'
      }
      if (callback) callback(err, ctx)
    })
  })
}



function storeError(ctx, err, callback) {
  var outFile = path.join(ctx.conf.reports.directory, ctx.created + '_3lata-ERROR.txt')
  fs.writeFile(outFile, err.stack + '\n' + util.inspect(ctx), 'utf8', function(err) {
    if (callback) callback(err, ctx)
  })
}

if (!module.parent) {
  var conf = process.argv.length > 2 ? require(process.argv[2]) : require('./raport_3lata_config')
  conf.reports.directory = '.'
  conf.backup.db.database = conf.reports.database
  var ctx = {
    conf: conf,
    warehouseName: conf.reports.warehouseName,
    //date: '2015-10-01',
    date: moment().format('YYYY-MM-DD'),
    testMode: false,
    created: moment().format('YYYY-MM-DD_HH-mm-ss'),
  }

  async.waterfall([
    common.initConnection(conf.backup.db, ctx),
    common.getWarehouseId, getBalances,
    //saveRecordsets,
    processBalances, renderRows
  ], function(err, ctx) {
    if (err) {
      console.log(err, ctx)
      return storeError(ctx, err, function() {
        setTimeout(process.exit, 500)
      })
    } else {
      process.exit()
    }
  })
} else {
  module.exports = {
    getBalances: getBalances,
    processBalances: processBalances,
    renderRows: renderRows,
    storeError: storeError,
  }
}
