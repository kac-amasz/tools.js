var csv = require('csv')

module.exports = printInvoice

var header = ['Nr dokumentu zakupu', 'Nr katalogowy towaru', 'Nazwa towaru',
  'Ilość towaru', 'Jednostka miary', 'Cena zakupu netto',
  'Bazowa cena sprzedaży netto', 'Stawka VAT'
]

function printInvoice(invoice, outputStream) {
  var stringifier = csv.stringify()
  stringifier.pipe(outputStream)
  stringifier.write(header)
  for (var i in invoice.recs) {
    var rec = invoice.recs[i]
    var unit = null
    switch (rec.unit) {
      case 'SZT':
        unit = 'szt.'
        break
      default:
        throw new Error('uknonwn unit, ' + rec.unit)
    }
    stringifier.write([invoice.id, rec.id, rec.name, rec.count, unit, rec.price / 100,
      rec.priceSell ? rec.priceSell / 100 : rec.price / 100, Math.round(rec.taxRate)
    ])
  }
  stringifier.end()
}
