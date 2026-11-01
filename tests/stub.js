window.UI = {InfoMessage: function (m) { console.log('INFO ' + m); }, ErrorMessage: function (m) { console.log('ERR ' + m); }};
window.image_base = 'https://dsnl.innogamescdn.com/asset/4b5375f7/graphic/';
window.Dialog = {show: function (id, h) {
    $('#d_' + id).remove();
    $('body').append($('<div>').attr('id', 'd_' + id)
        .css({position: 'absolute', top: '60px', left: '40px', background: '#f4e4bc', border: '3px solid #804000', padding: '8px'})
        .html(h));
}};
window.UI.SuccessMessage = function (m) { console.log('OK ' + m); };
window.__renamed = [];
window.TribalWars = {post: function (screen, params, data, ok) {
    window.__renamed.push(params.id + '=' + data.text);
    setTimeout(ok, 1);
}};
