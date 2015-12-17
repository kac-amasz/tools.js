// ==UserScript==
// @name        faktir_A
// @namespace   http://kac-amasz.com/
// @version     1.5
// {{#include}}
// @include     {{{.}}}
// {{/include}}
// @Grant       none
// ==/UserScript==
console.log('in ext');

var serv = 'http://192.168.2.2:3000/faktir/';
var plugin = false;
// {{#serverUrl}} {{{NL}}}serv = '{{{serverUrl}}}'; {{/serverUrl}}
// {{#plugin}} {{{NL}}}plugin = true; {{/plugin}}

function reqBinary(opts, callback) {
  try {
    var req = new XMLHttpRequest();
    req.responseType = 'arraybuffer';
    req.onload = function(evt) {
      callback(null, req.response);
    }
    req.onerror = function(evt) {
      callback(new Error(req.status + ':' + req.statusText));
    }
    req.open(opts.method, opts.url, true);
    req.send(opts.data);
    if (opts.timeout) setTimeout(function() {
      console.log('timeout status', req.status);
    }, opts.timeout);
  } catch (err) {
    callback(err);
  }
}

function processInvoice(url) {
  reqBinary({
    url: url,
    method: 'GET',
    data: null,
  }, function(err, data) {
    console.log(err, data);
    if (data) {
      reqBinary({
        method: 'POST',
        url: serv + 'process/A',
        data: data,
      }, function(err, data) {
        console.log(err, data);
        if (data) {
          var s = String.fromCharCode.apply(null, new Uint8Array(data));
          var j = JSON.parse(s);
          //console.log(j)
          var a = document.createElement('a');
          //a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('ąćęółśźż')
          a.href = 'data:text/csv;base64,' + j.contentBase64;
          a.download = 'faktura-' + decodeURIComponent(j.invoiceId) + '.csv';
          var e = document.createEvent('MouseEvent');
          e.initEvent('click', true, true);
          a.dispatchEvent(e);
        }
      });
    }
  });
}

if (plugin) {
  var fs = document.querySelectorAll('frameset>frame');
  if (fs.length < 3) exit();
  fs[2].addEventListener('load', function() {
    var href = document.querySelectorAll('frameset>frame')[2].contentDocument.querySelector('a[alt=Download]');
    if (!href) exit();
    href = href.href;
    processInvoice(href);
  }, false);
} else {
  function process() {
    processInvoice(serv + 'fakt/25');
    //processInvoice(serv + 'fakt/01');
  }
  if (document.readyState == 'complete') {
    process();
  } else {
    window.addEventListener('DOMContentLoaded', process);
  }
}
