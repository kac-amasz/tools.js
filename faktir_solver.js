module.exports = addCost

function print(rows) {
  for (var i = 0; i < rows.length; i++) {
    console.log(rows[i])
  }
}

var SolutionType = {
  MUL: 1,
  DIRECT: 1 << 1,
  ADD: 2 << 1,
  SUB: 3 << 1,
  ADDMUL: 4 << 1,
  SUBMUL: 5 << 1,
  CLONE: 6 << 1,

  MASK: 0xF,
}

function Solution() {
  this.diff = arguments[0]
  this.type = arguments[1]
  var a = []
  for (var i = 2; i < arguments.length; i++) a.push(arguments[i])
  this.args = a
}

function SolutionComparator(a, b) {
  var r = a.diff > b.diff ? 1 : a.diff < b.diff ? -1 : 0
  if (r == 0) r = a.type > b.type ? 1 : a.type < b.type ? -1 : 0
  return r
}

Solution.prototype.getType = function() {
  return this.type & (SolutionType.MASK << 1)
}
Solution.prototype.isMul = function() {
  return (this.type & SolutionType.MUL) > 0
}
Solution.prototype.toString = function() {
  var t = this.type
  var m = t & 0x01
  t = t & (SolutionType.MASK << 1)
  var s = ''
  s += this.diff + ' '
  if (m) s += '*'
  switch (t) {
    case SolutionType.DIRECT:
      s += 'DIRECT ' + this.args[0]
      break
    case SolutionType.ADD:
      s += 'ADD ' + this.args[0] + ' ' + this.args[1]
      break
    case SolutionType.SUB:
      s += 'SUB ' + this.args[0] + ' ' + this.args[1]
      break
    case SolutionType.ADDMUL:
      s += 'ADDMUL ' + this.args[0] + ' ' + this.args[1]
      break
    case SolutionType.SUBMUL:
      s += 'SUBMUL ' + this.args[0] + ' ' + this.args[1]
      break
    case SolutionType.CLONE:
      s += 'CLONE ' + this.args[0] + ' ' + this.args[1]
      break
    default:
      s += 'type=' + t
  }
  return s
}

function solveRest(rows, rest) {

  var sols = [],
    maxCountRow = -1,
    maxPriceRow = 0
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].count == rest) sols.push(new Solution(0, SolutionType.DIRECT, i))
    if (rest % rows[i].count == 0) sols.push(new Solution(rest / rows[i].count, SolutionType.DIRECT | SolutionType.MUL, i, rest / rows[i].count))
  }
  for (var i = 0; i < rows.length; i++) {
    var a = rows[i].count
    for (var j = 0; j < rows.length; j++) {
      if (i == j) continue
      var b = rows[j].count
      var sum = a + b
      var abs = a > b ? a - b : false
      if (sum == rest) sols.push(new Solution(0, SolutionType.ADD, i, j))
      if (abs && abs == rest) sols.push(new Solution(0, SolutionType.SUB, i, j))
      if (rest % sum == 0) sols.push(new Solution(rest / sum, SolutionType.ADD | SolutionType.MUL, i, j, rest / sum))
      if (abs && rest % abs == 0) sols.push(new Solution(rest / abs, SolutionType.SUB | SolutionType.MUL, i, j, rest / abs))
      if (rest > a && (rest - a) % b == 0) sols.push(new Solution((rest - a) / b, SolutionType.ADDMUL, i, j, (rest - a) / b))
      if ((rest + a) % b == 0) sols.push(new Solution((rest + a) / b, SolutionType.SUBMUL, i, j, (rest + a) / b))
        //if ((rest-a)%b==0) sols
    }
    if (a.count < rest && (maxCountRow < 0 || a.count > rows[maxCountRow].count)) maxCountRow = i
    if ((a.price + a.plus) > (rows[maxPriceRow].price + rows[maxPriceRow].plus)) maxPriceRow = i
  }

  sols.push(new Solution(100, SolutionType.CLONE, maxPriceRow, rest))

  sols.sort(SolutionComparator)
    //console.log(sols)
  return sols
}

function copy(row) {
  var r = {}
  for (var k in row) r[k] = row[k]
  return r
}

function addCost(rows, cost) {
  console.log('add cost', cost)
  var out = [],
    totalValue = 0,
    totalCount = 0,
    topPriceRow = -1,
    topPrice = -1
  for (var i = 0; i < rows.length; i++) {
    totalCount += rows[i].count
    totalValue += rows[i].count * rows[i].price
    if (topPrice < rows[i].price) {
      topPrice = rows[i].price
      topPriceRow = i
    }
  }

  var rest = cost
  for (var i = 0; i < rows.length; i++) {
    //rows[i].del = Math.floor(cost*rows[i].count*rows[i].price/totalValue)
    var del = cost * rows[i].count * rows[i].price / totalValue
    rows[i].plus = Math.floor(del / rows[i].count)
    rest -= rows[i].plus * rows[i].count
  }

  /*
    {
      var len = rows.length * rows.length
      var matrix2 = [Array(len), Array(len)]
      for (var i = 0; i < len; i++) {
        var a = rows[parseInt(i / rows.length)].count,
          b = rows[i % rows.length].count
        matrix2[0][i] = a + b
        matrix2[1][i] = Math.abs(a - b)
      }
      //console.log(matrix2)
    }
    //console.log(rest)
    */
  var sols = solveRest(rows, rest)
    //for (var s in sols) console.log(sols[s].toString())

  var sol = sols.shift()
  console.log('make ' + sol)
  if (sol.isMul()) {
    switch (sol.getType()) {
      case SolutionType.ADD:
        rows[sol.args[0]].plus += sol.args[2]
        rows[sol.args[1]].plus += sol.args[2]
        break
      case SolutionType.SUB:
        rows[sol.args[0]].plus += sol.args[2]
        rows[sol.args[1]].plus -= sol.args[2]
        break
      case SolutionType.DIRECT:
        rows[sol.args[0]].plus += sol.args[1]
        break
      default:
        throw new Error('unknown sol type ' + sol)
    }
  } else {
    switch (sol.getType()) {
      case SolutionType.DIRECT:
        rows[sol.args[0]].plus += 1
        break
      case SolutionType.ADD:
        rows[sol.args[0]].plus += 1
        rows[sol.args[1]].plus += 1
        break
      case SolutionType.SUB:
        rows[sol.args[0]].plus += 1
        rows[sol.args[1]].plus -= 1
        break
      case SolutionType.ADDMUL:
        rows[sol.args[0]].plus += 1
        rows[sol.args[1]].plus += sol.args[2]
        break
      case SolutionType.SUBMUL:
        rows[sol.args[0]].plus -= 1
        rows[sol.args[1]].plus += sol.args[2]
        break
      case SolutionType.CLONE:
        var r = rows[sol.args[0]]
        r.count -= 1
        r = copy(r)
        r.count = 1
        r.plus += sol.args[1]
        rows.push(r)
        break
      default:
        throw new Error('unknown sol type ' + sol)
    }
  }
  var newTotal = 0
  for (var r in rows) newTotal += (rows[r].price + rows[r].plus) * rows[r].count
    //console.log('new total ', newTotal, totalValue + cost, totalValue + cost - newTotal)
  if (newTotal != totalValue + cost) throw new Error('bad total')
  for (var r in rows) {
    rows[r].origPrice = rows[r].price
    rows[r].price += rows[r].plus
  }

  return rows
}

if (!module.parent) {
  //console.log(module.filename, '.js'))
  var minRecords = 3,
    maxRecords = 5,
    maxPrice = 300 * 100,
    maxCount = 30,
    maxCost = 40 * 100

  var recordsNum = Math.round(minRecords + Math.random() * (maxRecords - minRecords))


  var rows = []
  for (var i = 0; i < recordsNum; i++) {
    var row = {}
    row.id = i
    row.count = Math.floor(1 + Math.random() * maxCount)
    row.price = Math.round(Math.random() * maxPrice)
    rows.push(row)
  }
  var cost = Math.round(Math.random() * maxCost)

  if (false) {
    rows = []
    var ex = require('./' + require('path').basename(module.filename, '.js') + '_examples.js')
    var e = ex[0]
    cost = e.shift()
    var i = 0,
      v = null
    while (v = e.shift()) {
      rows.push({
        id: i++,
        count: v,
        price: e.shift()
      })
    }
  }

  {
    var rows2 = []
    rows2.push(cost)
    for (var i = 0; i < rows.length; i++) {
      rows2.push(rows[i].count)
      rows2.push(rows[i].price)
    }
    console.log(rows2)
  }

  var out = addCost(rows, cost)
}
