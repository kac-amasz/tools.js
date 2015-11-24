var async = require('async')
var moment = require('moment')
var path = require('path')
var fs = require('fs')
var util = require('util')
var common = require('./common')
var rep = require('./raport_3lata')


function reportSuccess(ctx, callback) {
  return common.mailReport(ctx.conf, 'Comiesięczny raport 3lata', 'dane w załączniku', [{
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
  var outFile = path.join(ctx.conf.reports.directory, ctx.created + "_3lata-ERROR.txt")
  fs.writeFileSync(outFile, err.stack + '\n' + util.inspect(ctx), 'utf8')
  return common.mailReport(ctx.conf, 'Błąd comiesięcznego raportu 3lata', ctx.created + '\n' + err.stack, null, function(err, info) {
    console.log(err, info)
    ctx.reportFailureInfo = info
    if (err) ctx.reportFailureErr = err
    if (callback) callback(err, ctx)
  })
}

var conf = process.argv.length > 2 ? require(process.argv[2]) : require('./config')
conf.backup.db.database = conf.reports.database

var ctx = {
  conf: conf,
  warehouseName: conf.reports.warehouseName,
  date: moment().startOf('month').format('YYYY-MM-DD'),
  testMode: false,
  created: moment().format('YYYY-MM-DD_HH-mm-ss'),
}

async.waterfall([
  common.initConnection(conf.backup.db, ctx),
  common.getWarehouseId, rep.getBalances,
  rep.processBalances, rep.renderRows, reportSuccess,
], function(err, ctx) {
  if (err) {
    console.log(err, ctx)
    return reportFailure(ctx, err, function() {
      setTimeout(process.exit, 500)
    })
  } else {
    process.exit()
  }
})
