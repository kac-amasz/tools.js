var sql = require('mssql')
var fs = require('fs')
var Mustache = require('mustache')
var moment = require('moment')
var path = require('path')
var Ftp = require('ftp')
var util = require('util')
var async = require('async')
var common = require('./common')
var conf = process.argv.length > 2 ? require(process.argv[2]) : require('./config')

var m_q1 = 'SELECT nrKatalogowy, SUM(stan) as stan, MAX(nazwa) as nazwa FROM dbo.StanyMagazynowe LEFT JOIN dbo.Towary ON idTowary = dbo.Towary.id WHERE idMagazyny = {{warehouseId}} AND stan > 0 GROUP BY nrKatalogowy ORDER BY nrKatalogowy'

function getStates(ctx, callback) {
  new sql.Request(ctx.conn).query(Mustache.render(m_q1, {
    warehouseId: ctx.warehouseId
  }), function(err, rs) {
    ctx.rows = rs
    if (callback) callback(err, ctx)
  })
}

function produceOutput(ctx, callback) {
  var outFile = path.join(ctx.conf.reports.directory, ctx.created + "_daily.txt")
  var out = fs.createWriteStream(outFile)
  out.on('error', function(err) {
    out.end()
    if (callback) callback(err, ctx)
  }).on('close', function() {
    ctx.outFile = outFile
    ctx.outFileContentType = 'text/plain; charset=UTF-8'
    if (callback) callback(null, ctx)
  })
  for (var r in ctx.rows) {
    r = ctx.rows[r]
    if (ctx.conf.reports.exclude.indexOf(r.nrKatalogowy) != -1) continue
    var nr = r.nrKatalogowy.replace(/^0+/, '')
    if (/[^A-Za-z0-9 ]/.test(nr)) {
      if (callback) callback(new Error('nieprawidłowy numer katalogowy: "' + n + '"'), ctx)
      return
    }
    var n = r.nazwa.substring(0, Math.min(40, r.nazwa.length)).trim()
    var l = nr + ';' + r.stan + ';' + ctx.conf.reports.clientId + ';' + n + ';' + 'CL' + ';'
      //console.log(l)
    out.write(l + '\n', 'utf8')
  }

  out.end()
    // if (callback) callback(null, ctx)
}

function sendOutput(ctx, callback) {
  var c = new Ftp()
  c.on('ready', function() {
    c.put(ctx.outFile, ctx.conf.reports.ftpPath, function(err) {
      c.end()
      if (callback) callback(err, ctx)
    })
  }).on('error', function(err) {
    c.end()
    if (callback) callback(err, ctx)
  })
  c.connect(ctx.conf.reports.ftpConf)
}

function reportSuccess(ctx, callback) {
  if (ctx.conf.reports.reportDailySuccessOn.indexOf(moment().day()) == -1) {
    if (callback) callback(null, ctx)
    return
  }
  return common.mailReport(ctx.conf, 'Codzienny raport stanów udany', 'dane w załączniku', [{
    filename: path.basename(ctx.outFile),
    content: fs.createReadStream(ctx.outFile),
    contentType: ctx.outFileContentType
  }], function(err, info) {
    ctx.reportSuccessInfo = info
    if (err) ctx.reportSuccessErr = err
    if (callback) callback(err, ctx)
  })
}

function reportFailure(ctx, err, callback) {
  var outFile = path.join(ctx.conf.reports.directory, ctx.created + "_daily-ERROR.txt")
  fs.writeFileSync(outFile, err.stack + '\n' + util.inspect(ctx), 'utf8')
  return common.mailReport(ctx.conf, 'Błąd codziennego raport stanów', ctx.created + '\n' + err.stack, null, function(err, info) {
    console.log(err, info)
    ctx.reportFailureInfo = info
    if (err) ctx.reportFailureErr = err
    if (callback) callback(err, ctx)
  })
}

conf.backup.db.database = conf.reports.database
var ctx = {
  conf: conf,
  warehouseName: conf.reports.warehouseName,
  testMode: false,
  created: moment().format('YYYY-MM-DD_HH-mm-ss'),
}



async.waterfall([
  common.initConnection(conf.backup.db, ctx),
  common.getWarehouseId, getStates, produceOutput, sendOutput, reportSuccess
  //, getStates, parseStates, renderRows
], function(err, ctx) {
  console.log(err, ctx)
  if (err) {
    return reportFailure(ctx, err, function() {
      setTimeout(process.exit, 500)
    })
  } else {
    process.exit()
  }
})
