
let serverAddr = "120.26.125.181";

// 创建一个Client对象，cc=CreateClient
const cc = DispRTC.createClient({"server": "https://"+serverAddr});




// 判断是否已经登录
if (cc.isLogin()) {
    alertData(false, "已经登录辣");
    showBtn(true);
}

/**
 * 退出客户端
 */
function quitClient() {
    $.removeCookie("access_token");
    DispRTC.destroy();
}

/**
 * 登录操作
 */
function funcLogin() {
    // 获取输入用户名和输入密码
    let username = $("#username").val();
    let password = $("#password").val();
    if (!username || !password) {
        // 回调
        alertData(false, "账号或用户名不能为空");

        return;
    }

    // 登录
    cc.login(username, password).then((msg) => {

        let access_token = sessionStorage.getItem("DispRTC-token")
        $.cookie("DispRTC-token", access_token, {"path": "/"});

        // 登录成功弹窗
        alertData(true, "登录成功");
        showBtn(true)

    }).catch((err) => {
        // 登录失败弹窗
        alertData(false, "登录失败了：" + JSON.stringify(err));
        showBtn(false)
        return;
    });
}


$("#password").keydown(function (e) {
    if (e.keyCode === 13) {
        // 调用登录函数
        funcLogin();
    }
});

// 添加登录点击事件
$("#login_btn").click(function () {

    // 调用登录函数
    funcLogin();

});
// 点击退出按钮事件
$("#logout_btn").click(function () {

    // 退出回调
    alertData(false, "退出登录");
    showBtn(false)
    // 退出函数
    quitClient()
});

// 点击开启、关闭值班事件
$("#work").click(function () {
    if ($(this).attr("work_info") === "false") {
        cc.stopWork();
        $(this).attr("work_info", "true").text("关闭无人值守");

    } else {
        cc.startWork();
        $(this).attr("work_info", "false").text("开启无人值守");

    }
})


/**
 * 展示按钮
 * @param flag Boolean值
 */
function showBtn(flag) {
    $("#login_btn").attr("disabled", flag)
    $("#logout_btn").attr("disabled", !flag)
    $("#work").attr("disabled", !flag)
    $("#user_info_btn").attr("disabled", !flag)
}


/**
 * 弹出提示
 * @param info 传入类型，好消息为true，坏消息为false
 * @param text 传入文字
 */
function alertData(info, text) {
    if (info === false) {
        $("#alert_data").removeClass("alert-success").addClass("alert-danger").show(function () {
            $(this).children("#alert_msg").text(text);
        });
    } else {
        $("#alert_data").removeClass("alert-danger").addClass("alert-success").show(function () {
            $(this).children("#alert_msg").text(text);
        });
    }
}

// 查看我的信息
$('#user_info').on('shown.bs.modal', function () {
    $('#user_info_btn').focus()
    cc.getOperatorInfo().then((result) => {
        $("#content").text(result.data.realName)

    })
    console.log("展示操作员个人信息")
})