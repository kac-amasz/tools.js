var mssql = require('mssql')
var date = require('moment')().format('YY-MM-DD_HH-mm-ss')
var fs = require('fs')
var path = require('path')
var async = require('async')
var util = require('util')
var mkdirp = require('mkdirp')
var crypto = require('crypto')
var util = require('util')
var tar = require('tar')
var fstream = require('fstream')
var zlib = require('zlib')
var AWS = require('aws-sdk')
var common = require('./common')
var conf = process.argv.length > 2 ? require(process.argv[2]) : require('./config')



var testMode = false
try {
  var stats = fs.statSync(conf.backup.test_dir)
  if (stats.isDirectory()) {
    testMode = true
  }
} catch (err) {}

var targetDir = testMode ? conf.backup.test_dir : conf.backup.dir
var targetDirS = path.join(targetDir, conf.backup.zip_prefix + '_' + date)

function backupDb(dbName, callback) {
  var ctx = this.ctx
  try {
    mkdirp.sync(ctx.directory)
  } catch (err) {
    if (callback) callback(err)
    return err
  }

  var dbFile = path.join(ctx.directory, dbName + '_' + ctx.date + '.bak')
  var sql = 'BACKUP DATABASE [' + dbName + '] TO DISK = \'' + dbFile + '\''
  console.log(sql)
    // exec
  if (ctx.testMode) {
    fd = fs.openSync(dbFile, 'w')
    fs.writeSync(fd, 'test ' + dbFile)
    fs.closeSync(fd)
    if (callback) callback(null, dbFile)
    return dbFile
  } else {
    var req = new mssql.Request(ctx.conn)
    return req.query(sql, function(err) {
      if (err) {
        if (callback) callback(new Error('backup bazy [' + dbName + ']: ' + err))
        return err
      } else {
        if (callback) callback(null, dbFile)
        return dbFile
      }
    })
  }
}

function backupDbs(ctx, callback) {
  async.map(ctx.toBackup, backupDb.bind({
    ctx: ctx
  }), function(err, files) {
    ctx.files = files
    if (callback) callback(err, ctx)
  })
}

function backup(ctx, callback) {
  var dbName = ctx.toBackup.shift()
  if (!dbName) {
    if (callback) callback(null, ctx)
    return
  }
  try {
    mkdirp.sync(ctx.directory)
  } catch (err) {
    if (callback) callback(err, ctx)
    return err
  }
  if (!ctx.files) ctx.files = []

  var dbFile = path.join(ctx.directory, dbName + '_' + ctx.date + '.bak')
  var sql = 'BACKUP DATABASE [' + dbName + '] TO DISK = \'' + dbFile + '\''
  console.log(sql)
    // exec
  if (ctx.testMode) {
    fd = fs.openSync(dbFile, 'w')
    fs.writeSync(fd, 'test ' + dbFile)
    fs.closeSync(fd)
    ctx.files.push(dbFile)
    backup(ctx, callback)
  } else {
    var req = new mssql.Request(ctx.conn)
    req.query(sql, function(err) {
      if (err) {
        if (callback) callback(new Error('backup bazy [' + dbName + ']: ' + err), ctx)
        return err
      } else {
        ctx.files.push(dbFile)
        backup(ctx, callback)
      }
    })
  }
}

function createZip(ctx, callback) {
  try {
    var zipFile = ctx.directory + ".tar.gz"
    var fileStream = fs.createWriteStream(zipFile)
    var gzip = zlib.createGzip({
      level: 1
    })
    var packer = tar.Pack({
        noProprietary: true
      })
      .on('error', function(err) {
        if (callback) callback(err, ctx)
      })
      .on('end', function() {
        ctx.zipFile = zipFile
        ctx.zipFileContentType = 'application/x-tar'
        if (callback) callback(null, ctx)
      })
    fstream.Reader({
        path: ctx.directory,
        type: 'Directory'
      })
      /*.on('error', function(err) {
        if (callback) callback(err, ctx)
      })*/
      .pipe(packer)
      .pipe(gzip)
      .pipe(fileStream)

  } catch (exc) {
    if (callback) callback(new Error('creating zip: ' + exc), ctx)
    return console.log(exc)
  }
}

function cleanUp(ctx, callback) {
  var error = null
  try {
    for (var i = 0; i < ctx.files.length; i++) {
      fs.unlinkSync(ctx.files[i])
    }
    fs.rmdirSync(ctx.directory)
  } catch (err) {
    error = err
  }
  if (callback) return callback(error, ctx)
}

function encrypt(ctx, callback) {
  var error = null

  var algorithm = 'aes-256-ctr',
    password = ctx.conf.backup.encryptPassword;

  var outFile = ctx.zipFile + '.aes'
  var r = fs.createReadStream(ctx.zipFile);
  var encrypt = crypto.createCipher(algorithm, password);
  var w = fs.createWriteStream(outFile)
  var errHandler = function() {
    if (callback) callback(err, ctx)
  }
  r.on('error', errHandler)
    .pipe(encrypt).on('error', errHandler)
    .pipe(w).on('error', errHandler).on('close', function() {
      ctx.zipFile = outFile
      ctx.zipFileContentType = 'application/octet-stream'
      if (callback) callback(null, ctx)
    })
}

function uploadZip(ctx, callback) {
  var conf = ctx.conf
  var awsConfig = {
      accessKeyId: conf.aws.access_key_id,
      secretAccessKey: conf.aws.secret_access_key,
      sslEnabled: true,
      region: conf.aws.s3.region,
      httpOptions: {
        timeout: 60 * 1000 * 10
      }
    }
    //AWS.S3.ManagedUpload.minPartSize = 15 * 1024 * 1024

  var params = {
    Bucket: conf.aws.s3.bucket,
    Key: conf.backup.key_prefix + path.basename(ctx.zipFile),
    Body: fs.createReadStream(ctx.zipFile),
    //ContentType: 'application/zip',
    ContentType: ctx.zipFileContentType,
    StorageClass: 'STANDARD_IA'
  }
  var upload = new AWS.S3.ManagedUpload({
    params: params,
    queueSize: 3,
    partSize: 10 * 1000 * 1000,
    service: new AWS.S3(awsConfig),
  });
  var uploadedPercent = -1
  upload.on('httpUploadProgress', function(evt) {
    var u = parseInt(evt.loaded * 100 / evt.total)
    if (u > uploadedPercent) {
      console.log("progress: " + u + "%")
      uploadedPercent = u
    }
  });
  upload.send(function(err, data) {
    ctx.uploadData = data
    if (callback) callback(err, ctx)
  });
}

function cleanUpEncrypted(ctx, callback) {
  var error = null
  fs.unlink(ctx.zipFile, function(err) {
    if (callback) callback(err, ctx)
  })
}

function reportSuccess(ctx, callback) {
  if (!ctx.conf.backup.report_success) {
    if (callback) callback(null, ctx)
    return
  }

  return common.mailReport(ctx.conf, 'Kopia zapasowa udana', ctx.date + '\nwykonanie kopii zapasowej przebiegło pomyślnie', null, function(err, info) {
    ctx.reportSuccessInfo = info
    if (err) ctx.reportSuccessErr = err
    if (callback) callback(err, ctx)
  })
}

function storeError(ctx, err, callback) {
  var outFile = ctx.directory + ".ERROR.txt"
  fs.writeFile(outFile, err.stack + '\n' + util.inspect(ctx), 'utf8', function(err) {
    if (callback) callback(err, ctx)
  })
}

function reportFailure(ctx, err, callback) {
  return common.mailReport(ctx.conf, 'Błąd kopii zapasowej', ctx.date + '\n' + err.stack, null, function(err, info) {
    console.log(err, info)
    ctx.reportFailureInfo = info
    if (err) ctx.reportFailureErr = err
    if (callback) callback(err, ctx)
  })
}


var ctx = {
  conf: conf,
  date: date,
  toBackup: conf.backup.databases.slice(0),
  directory: targetDirS,
  testMode: testMode,
}

async.waterfall([
  common.initConnection(conf.backup.db, ctx),
  //backup,
  backupDbs,
  createZip, cleanUp, uploadZip, reportSuccess, process.exit
  //createZip, cleanUp, encrypt, uploadZip, cleanUpEncrypted, reportSuccess, process.exit
], function(err, ctx) {
  console.log(err, ctx)
    //if (err) return reportFailure(ctx, err, process.exit)
  if (err) {
    return storeError(ctx, err, function() {
      reportFailure(ctx, err, process.exit)
    })
  } else {
    process.exit()
  }
})
