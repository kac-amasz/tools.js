var sql = require('mssql')
var async = require('async')
var nodemailer = require('nodemailer')

module.exports = {
  getWarehouseId: function(ctx, callback) {
    if (ctx.testMode) {
      ctx.warehouseId = 3
      if (callback) callback(null, ctx)
      return
    }
    var req = new sql.Request(ctx.conn)
    req.query('SELECT id FROM Magazyny WHERE nazwa = \'' + ctx.warehouseName + '\'', function(err, rs) {
      if (err) {
        if (callback) callback(err, ctx)
        return
      }
      if (rs.length < 1) {
        if (callback) callback(new Error('nie znaleziono magazynu \'' + ctx.warehouseName + '\''), ctx)
        return
      }
      ctx.warehouseId = rs[0].id
      if (callback) callback(null, ctx)
    })
  },
  mailReport: function(conf, subject, msg, attachments, callback) {
    console.log('report: ' + subject + ': ' + msg)

    var transporter = nodemailer.createTransport({
      //service: 'Gmail',
      host: conf.mail.smtp.host,
      port: conf.mail.smtp.port,
      secure: conf.mail.smtp.starttls.enable,
      auth: {
        user: conf.mail.user,
        pass: conf.mail.password
      }
    });

    var mailOptions = {
      from: 'agro-raporty ✔ <' + conf.mail.from + '>',
      to: conf.mail.to,
      subject: subject,
      text: msg,
      attachments: attachments,
      // html: '<b>Hello world ✔</b>' // html body
    };

    transporter.sendMail(mailOptions, function(error, info) {
      if (error) {
        console.log(error);
      }
      console.log('Message sent: ' + info.response);
      if (callback) callback(error, info)
    });
  },

  initConnection: function(dbConf, ctx) {
    return function(callback) {
      if (ctx.testMode) {
        if (callback) callback(null, ctx)
        return
      }
      var conn = new sql.Connection(dbConf)
      async.retry({
        times: dbConf.connectionRetries,
        interval: dbConf.connectionRetryInverval
      }, conn.connect.bind(conn), function(err, result) {
        //console.log('retry result: ', err, result)
        ctx.conn = conn
        if (callback) callback(err, ctx)
      })
    }
  }
}
