$(document).ready(function () {

    sessionStorage.setItem("DispRTC-token", $.cookie("DispRTC-token"))
    // 设置token
    let token = JSON.parse($.cookie("DispRTC-token")).content;
    const cc = DispRTC.createClient({"server": "https://192.168.1.200", "token": token});

    const rtcStream = new DispRTC.RTCStream({
        "client": cc,
        "phone": "801",
        "password": "1",
        "wsServer": "ws://192.168.1.200"
    });
    rtcStream.init(function (event) {
        console.log("sessionEvent:" + event)
    }, function (event) {
        console.log("stackEvent:" + event)
    })
});