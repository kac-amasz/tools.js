var TS_FMT = "YYYY-MM-DDTHH:mm:ss.SSS"

function formatCurrency(value) {
  var s = "";

  function take(div, sep, prec) {
    var v = (value / div) | 0;
    var vv = "" + v;
    if (s.length > 0) {
      while (vv.length < prec)
        vv = "0" + vv;
      s += vv + sep;
    } else if (v > 0) {
      s += vv + sep;
    }
    value %= div;
  }
  take(1000000 * 100, ".", 3)
  take(1000 * 100, ".", 3)
  take(100, ",", 3)
  take(1, "", 2)
  if (s.length == 0) {
    s = "0"
  }
  return s
}

function createRow(data) {
  var tr = $("#sample_table tr").clone()[0]
  var part = data.part
  $(tr).data('part', part)
  $(tr).data('count', data.count)
  $(tr).data('price', data.price)
  $(tr).addClass("part_row")
  $(tr).find(".part_count_input")
    .val(data.count)
    .TouchSpin({
      min: 1,
      max: 1000,
      stepinterval: 1,
      maxboostedstep: 2,
      //initval: 1,
    })
    .on('change', function(evt) {
      //console.log(evt)
      $($(evt.target).parents('tr')[0]).data('count', evt.target.value).trigger('total_change') //trigger on tr
    })
  $(tr).find('.part_id').text(part.id)
  $(tr).find('.part_name').text(part.name)
  $(tr).find('.price_min').text(part.priceMin)
  $(tr).find('.price_max').text(part.priceMax)
  $(tr).find('.part_price_slider')
    .attr('data-slider-min', part.priceMin)
    .attr('data-slider-max', part.priceMax)
    .attr('data-slider-value', data.price)
    .attr('data-slider-step', Math.round(part.priceMax - part.priceMin) / 100)
    .on('change', function(evt) {
      $($(evt.target).parents('tr')[0]).data('price', evt.value.newValue).trigger('total_change') //trigger on tr

    })
    .slider()
  $(tr).on('total_change', function(evt) {
    evt.stopPropagation()
    var v = $(evt.target).data('count') * $(evt.target).data('price')
    v = Math.round(v * 100) / 100
    $(evt.target).data('total_value', v)
    $(evt.target).find('.part_sum').text(formatCurrency(v * 100))
    $($(evt.target).parents('.parts_panel')[0]).trigger('total_change') //call parts_panel
  })
  $(tr).find(".btn-danger").on("click", function(evt) {
    var panel = $(evt.target).parents('.parts_panel')[0]
    $(tr).remove();
    $(panel).trigger('total_change');
  })

  return tr
}

function addRow(panel, part) {
  if (!$(panel).data('order_name')) {
    var name = 'Nowy ' + moment().format('YY/MM/DD HH:mm')
    $(panel).find('.order_name').val(name)
    $(panel).data('order_name', name)
    $(panel).data('created', moment.utc().format(TS_FMT))
  }
  var tr = createRow(part)
  $(panel).find('.parts_table tbody').prepend(tr)
  $(tr).trigger('total_change')
}

function getPart(id, callback) {
  $.ajax({
    type: "GET",
    url: "part/" + id,
    success: function(data) {
      callback(null, data)
    },
    error: function(req, status, errMsg) {
      callback(new Error(errMsg), null)
    }
  })
}

function getOrders(params, callback) {
  $.ajax({
    type: 'GET',
    url: 'orders',
    data: params,
    success: function(data) {
      if (data.err) return callback(new Error(data.err), null)
      callback(null, data.value)
    },
    error: function(req, status, errMsg) {
      callback(new Error(errMsg), null)
    }
  })
}

function addOrders(params) {
  getOrders(params, function(err, data) {
    if (err) return showError(err.toString())
    for (var r in data) {
      r = data[r]
      var tr = renderOrderName(r)
      $('#orders_panel .panel-body tbody').append(tr)
    }
  })
}

function showError(msg) {
  $(".top-left").notify({
    message: {
      text: msg
    },
    type: "danger"
  }).show();
}

function showSuccess(msg) {
  $(".top-left").notify({
    message: {
      text: msg
    },
    type: "success"
  }).show();
}

function readPanel(panel) {
  var order = {
    records: []
  }
  $(panel).find('.parts_table tr').each(function(idx, el) {
    order.records.push({
      part: $(this).data('part'),
      count: $(this).data('count'),
      price: $(this).data('price')
    })
  })
  order.name = $(panel).data('order_name')
  order.created = $(panel).data('created')
  order.updated = $(panel).data('updated')
  order.saved = $(panel).data('saved')
  return order
}

function loadOrder(panel, order) {
  $(panel)
    .removeData()
    .data('bypass_update', true)
    .data('order_name', order.name)
    .data('created', order.created)
    .data('updated', order.updated)
    .data('saved', order.saved)
  $(panel).find('.parts_table tbody').empty()
  if (order.records.length > 0)
    for (var r = order.records.length; r > 0; r--)
      addRow(panel, order.records[r - 1])

  $(panel).data('bypass_update', false).show()
}

function getOrder(created, updated, callback) {
  $.ajax({
    type: 'GET',
    url: 'order/' + created + '/' + updated,
    success: function(data) {
      if (data.err) return callback(new Error(data.err), null)
      callback(null, data.value)
    },
    error: function(req, status, errMsg) {
      callback(new Error(errMsg), null)
    }
  })
}

function renderOrderName(orderName) {
  return $('<tr>')
    .data('order_name', orderName)
    .append($('<td>').text(orderName.name))
    .append($('<td>').text(moment.utc(orderName.updated, TS_FMT).fromNow()))
    .on('click', function(evt) {
      getOrder(orderName.created, orderName.updated, function(err, order) {
        if (err) return showError(err)
        loadOrder('#parts_panel', order)
        $('#orders_panel').hide()
      })
    })
}

function printOrder(order) {
  $.ajax({
    type: 'POST',
    url: 'order/print',
    data: JSON.stringify(order),
    contentType: 'application/json; charset=utf-8',
    success: function(data) {
      var myWindow = window.open("", "MsgWindow", "width=800, height=600")
      myWindow.document.write(data)
      myWindow.print()
      myWindow.close()
    },
    error: function(req, status, errMsg) {
      showError(errMsg)
      console.log('resp err', errMsg)
    }
  })
}

// init

$(document).ready(function() {
  $("#search_text").on("focus", function(evt) {
    $("#search_text").val("")
  }).on('paste', function() {
    var commit = $('#search_commit')
    window.setTimeout(commit.click.bind(commit), 50)
  })

  $('#parts_panel').on('total_change', function(evt) {
    console.log('panel total change')
    evt.stopPropagation()
    var total = 0
    $(evt.target).find('.parts_table tr').each(function(idx, tr) {
      total += $(this).data('total_value')
    })
    $(evt.target).data('total_value', total)
    $(evt.target).find('.rows_total_value').text(formatCurrency(total * 100)).focus() //focus out from active edits
    $(evt.target).find('.rows_total_value_gross').text(formatCurrency(total * 123))
    $(evt.target).find('.order_name').val($(evt.target).data('order_name'))
    if (!$(evt.target).data('bypass_update')) {
      $(evt.target).data('updated', moment.utc().format(TS_FMT))
      $('#order_save_button').removeClass('btn-default').addClass('btn-warning')
    }
    //$('#search_text').focus() // focus out to change color of 'save'
    //$('#order_print_button').focus() // focus out to change color of 'save'
  })

  $('#search_commit').on('click', function(evt) {
    evt.preventDefault()
      //if (!$('#parts_panel').is(':visible')) return false
    var id = $('#search_text').val().trim()
    if (id.length == 0) return
    getPart(id, function(err, data) {
      if (!err) err = data.err
      if (err) {
        if (err.toString().indexOf('NotFoundError:') == 0) err = 'nie znaleziono'
        return showError(err)
      }
      addRow($('#parts_panel'), {
        part: data.value,
        count: 1,
        price: data.value.priceMax
      })
      $('#search_text').val('')
      $('#orders_panel').hide()
      $('#parts_panel').show()
    })
  })

  $('#parts_panel .order_name').on('change', function(evt) {
    var val = $(evt.target).val()
      //console.log('name change: '+val)
    $(evt.target).parents('.parts_panel:first').each(function() {
      var n = $(this).data('order_name')
      $(this).data('order_name', val)
      if (n != val) $(this).trigger('total_change')
    })
  }).on('click', function(evt) {
    $(evt.target).select()
  })

  $('#order_save_button').on('click', function(evt) {
    evt.preventDefault()
    var order = readPanel('#parts_panel')
    console.log('from read', order)
    if (order.updated && ((!order.saved) || (order.saved < order.updated))) {
      var doPut = order.saved ? true : false
      console.log(order.saved, doPut)
      order.saved = order.updated
      console.log('save', order)
      $.ajax({
        type: doPut ? 'PUT' : 'POST',
        url: 'order',
        data: JSON.stringify(order),
        contentType: 'application/json; charset=utf-8',
        success: function(data) {
          if (data.err) return showError(data.err)
          showSuccess('zapisano')
            //console.log('resp', data)
          $('#parts_panel').data('saved', order.saved)
          $('#order_save_button').removeClass('btn-warning').addClass('btn-default')
          //$('#search_text').focus() // focus out to change color of 'save'
          //$('#order_save_button').focus()
          $(evt.target).blur()
        },
        error: function(req, status, errMsg) {
          showError(errMsg)
          console.log('resp err', errMsg)
        }
      })
    }
  })

  $('#orders_panel button.orders_add_button').click(function(evt) {
    var params = {}
    var orderName = $('#orders_panel table tbody tr').last().data('order_name')
    if (orderName) params.from = orderName.created
    addOrders(params)
  })

  $('#order_print_button').click(function(evt) {
    evt.preventDefault()
    if ($('#parts_panel').data('created')) {
      printOrder(readPanel('#parts_panel'))
    }
  })
})
