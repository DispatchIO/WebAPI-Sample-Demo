$(document).ready(function () {

    sessionStorage.setItem("DispRTC-token", $.cookie("DispRTC-token"))
    // 设置token
    let token = JSON.parse($.cookie("DispRTC-token")).content;
    const cc = DispRTC.createClient({"server": "https://192.168.1.200", "token": token});

    $("#login_status_btn").click(function () {
        $(this).attr("disabled", true).text("正在监听")
        $("#login_status_text").focus().append("开始监听【登录状态事件】：LOGIN_STATUS\r\n");

        loginStatusListen()
    })

    /**
     * 监听登录状态事件
     */
    function loginStatusListen() {

        // 监听登录状态
        cc.on(DispRTC.EventType.LOGIN_STATUS, (msg) => {

            $("#login_status_text").focus().append(JSON.stringify(msg) + "\r\n")
            if (msg.data.code === 480) {
                $(this).attr("disabled", false).text("开始监听")
            }
        });
    }
});