$('#incomings_table tr.nowrap').each(function(){$(this).append('<td><input type=checkbox class=snipeSelectedSnipes></td>')});
$('body').append('<input id=openSnipeInterface type=button value=open>');
$('#openSnipeInterface').on('click',function(){$('body').append('<input class=importButton type=button value=imp>');$('.importButton').on('click',function(){$('body').append('<textarea class=importArea></textarea><input class=importTargets type=button value=go>');$('.importTargets').on('click',function(){window.__imported=$('.importArea').val();});});});
