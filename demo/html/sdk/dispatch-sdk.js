!(function (e, t) {
  "object" == typeof exports && "undefined" != typeof module
    ? (module.exports = t())
    : "function" == typeof define && define.amd
    ? define(t)
    : ((e = "undefined" != typeof globalThis ? globalThis : e || self).DispRTC =
        t());
})(this, function () {
  "use strict";

  const sdkVersion = "1.0.0";

  const loadJs = (name) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.type = "text/javascript";
      script.src = `/static/offlinemap/${name}`;
      script.onerror = reject;
      // 兼容ie
      script.onload = script.onreadystatechange = function () {
        if (
          !this.readyState || //这是FF的判断语句，因为ff下没有readyState这人值，IE的readyState肯定有值
          this.readyState == "loaded" ||
          this.readyState == "complete" // 这是IE的判断语句
        ) {
          resolve();
        }
      };
      document.head.appendChild(script);
    });
  };

  const isCef = navigator.userAgent.toLowerCase().includes("mycef");

  /**
   * http客服端
   */
  var http = null;
  var request = null;

  /**
   * 创建http客户端，使用axios
   * @param {String} serverUrl 服务器URL
   */
  const createAxois = (serverUrl) => {
    const instance = axios.create({
      baseURL: serverUrl,
      // timeout: 10000, //超时时间 10s
    });
    instance.defaults.headers.post["Content-Type"] = "application/json;";
    // 添加请求拦截器
    instance.interceptors.request.use(
      (config) => {
        const token = DispRTC.client?.token || Store.get("token") || "";
        if (config.url !== "/account/sign_in") {
          if (!token) return Promise.reject("用户未登录");
          config.headers.access_token = token;
        }

        return config;
      },
      (error) => {
        if (DispRTC.client.token) return Promise.reject(error);
      }
    );

    // 添加响应拦截器
    instance.interceptors.response.use(
      (response) => {
        if (response.data.code === 403 || response.data.code === 480) {
          DispRTC.client &&
            DispRTC.client?.emit(EventType.LOGIN_STATUS, {
              eventType: EventType.LOGIN_STATUS,
              data: { code: response.data.code, msg: response.data.msg },
            });
          //重连或清空Client客户端
          clearCLient(response.data.code);
          return Promise.reject(response.data);
        } else if (response.data.code !== 200) {
          return Promise.reject(response.data);
        } else {
          return Promise.resolve(response.data);
        }
      },
      (error) => {
        return Promise.reject(error);
      }
    );
    return instance;
  };

  /**
   * 配置
   */
  const Conf = {
    USE_NEW_LOG: false,
  };

  const setConf = (key, value) => {
    Object.keys(Conf).includes(key) && (Conf[key] = value);
  };

  const getConf = (key) => Conf[key];

  const timeMill = () => {
    const e = new Date();
    return (
      e.toLocaleDateString().replaceAll("/", "-") +
      " " +
      e.toLocaleTimeString() +
      ":" +
      e.getMilliseconds()
    );
  };

  /**
   * 日志等级
   */
  const LogLevel = { DEBUG: 0, INFO: 1, WARNING: 2, ERROR: 3, NONE: 4 };
  const CurTime = Date.now();

  const levelKey = (level) => {
    for (const t in LogLevel) if (LogLevel[t] === level) return t;
    return "DEFAULT";
  };

  class Log {
    constructor(log) {
      this.prefixLists = [];
      this.logger = log;
    }
    debug(...args) {
      this.logger.debug(...this.prefixLists, ...args);
    }
    info(...args) {
      this.logger.info(...this.prefixLists, ...args);
    }
    warn(...args) {
      this.logger.warn(...this.prefixLists, ...args);
    }
    error(...args) {
      this.logger.error(...this.prefixLists, ...args);
    }
    prefix(e) {
      return this.prefixLists.push(e), this;
    }
    popPrefix() {
      return this.prefixLists.pop(), this;
    }
  }

  const Logger = new (class {
    constructor() {
      this.logLevel = LogLevel.DEBUG;
      this.url = void 0;
    }

    debug(...args) {
      this.log([LogLevel.DEBUG].concat(args));
    }
    info(...args) {
      this.log([LogLevel.INFO].concat(args));
    }
    warn(...args) {
      this.log([LogLevel.WARNING].concat(args));
    }
    error(...args) {
      this.log([LogLevel.ERROR].concat(args));
    }

    setLogLevel(e) {
      this.logLevel = Math.min(Math.max(0, e), 4);
    }

    prefix(e) {
      return new Log(this).prefix(e);
    }
    log(t) {
      try {
        for (let i = 1, l = t.length; i < l; i++) {
          if (isCef) {
            if (t[i] instanceof Error) {
              t[i] instanceof Err && (t[i] = JSON.stringify(t[i]));
            } else if (typeof t[i] === "object") t[i] = JSON.stringify(t[i]);
          }
        }

        const logLevel = Math.max(0, Math.min(4, t[0]));

        t[0] = timeMill() + " Disp-SDK [".concat(levelKey(logLevel), "]:");
        if (logLevel < this.logLevel) return;

        const n = timeMill() + " %cDisp-SDK [".concat(levelKey(logLevel), "]:");
        let o = [];
        if (!getConf("USE_NEW_LOG"))
          switch (logLevel) {
            case LogLevel.DEBUG:
              (o = [n, "color: #64B5F6;"].concat(t.slice(1))),
                console.log.apply(console, o);
              break;
            case LogLevel.INFO:
              (o = [n, "color: #1E88E5; font-weight: bold;"].concat(
                t.slice(1)
              )),
                console.log.apply(console, o);
              break;
            case LogLevel.WARNING:
              (o = [n, "color: #FB8C00; font-weight: bold;"].concat(
                t.slice(1)
              )),
                console.warn.apply(console, o);
              break;
            case LogLevel.ERROR:
              (o = [n, "color: #B00020; font-weight: bold;"].concat(
                t.slice(1)
              )),
                console.error.apply(console, o);
          }
      } catch (err) {
        console.warn("打印日志错误", err);
      }
    }
  })();

  /**
   * 工具类
   */
  class Util {
    /**
     * Aes 加密
     * @param {String} message 加密内容
     * @param {String} key 秘钥
     * @returns
     */
    static aesEncrypt(message, key = "000000") {
      return CryptoJS.AES.encrypt(
        CryptoJS.enc.Utf8.parse(message),
        CryptoJS.enc.Utf8.parse(key),
        {
          mode: CryptoJS.mode.ECB,
          padding: CryptoJS.pad.Pkcs7,
        }
      ).toString();
    }

    /**
     * Aes解密
     * @param {String} message 解密内容
     * @param {String} key 秘钥
     * @returns
     */
    static aesDecrypt(message, key = "000000") {
      return CryptoJS.AES.decrypt(message, CryptoJS.enc.Utf8.parse(key), {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
      }).toString(CryptoJS.enc.Utf8);
    }

    /**
     * base64加密
     * @param {String} str 加密内容
     */
    static base64Encrypt(str) {
      return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(str));
    }

    /**
     * 对用户名和密码进行自定义签名
     * @param {String} str 加密内容
     * @param {String} key 秘钥
     */
    static sign(str, key = "") {
      let secretKey = "" + key;
      if (secretKey.length > 16) {
        secretKey = secretKey.substring(0, 16);
      }
      while (secretKey.length < 16) {
        secretKey = "0" + secretKey;
      }
      return this.base64Encrypt(
        str +
          ":" +
          this.aesEncrypt(
            str + "@" + key + "@" + this.parseTime2Str(),
            secretKey
          )
      );
    }

    /**
     * 格式化时间为yyyyMMddHHmmss
     * @param {Date} date
     * @returns
     */
    static parseTime2Str(date = new Date()) {
      let year = date.getFullYear();
      let month = date.getMonth() + 1;
      month < 10 && (month = "0" + month);
      let day = date.getDate();
      day < 10 && (day = "0" + day);
      let hour = date.getHours();
      hour < 10 && (hour = "0" + hour);
      let minute = date.getMinutes();
      minute < 10 && (minute = "0" + minute);
      let second = date.getSeconds();
      second < 10 && (second = "0" + second);
      return "" + year + month + day + hour + minute + second;
    }

    /**
     * 判断对象是否为空，包含undefined,'',null, {},[]
     * @param {*} obj
     * @returns
     */
    static isEmpty(obj) {
      if (obj === undefined || obj === null) return true;
      if (typeof obj === "boolean" || typeof obj === "number") return false;
      if (typeof obj === "string") {
        return !obj.trim();
      }
      return Object.keys(obj).length === 0;
    }

    /**
     * 判断对象是否不为空，包含undefined,'',null, {},[]
     * @param {*} obj
     * @returns
     */
    static isNotEmpty(obj) {
      return !this.isEmpty(obj);
    }

    /**
     * 是否包含空
     * @param  {...any} args
     */
    static hasEmpty(...args) {
      for (let i = 0; i < args.length; i++) {
        if (this.isEmpty(args[i])) return true;
      }
      return false;
    }
  }

  /**
   * 存储类
   */
  class Store {
    /**
     * 存储前缀
     */
    static prefix = "DispRTC-";

    /**
     * 缓存key
     */
    static Keys = {
      user: "user",
      token: "token",
      defaultDevice: "default-device",
    };

    /**
     * 存储storage
     */
    static set(params = {}) {
      let { name, content, type } = params;
      name = this.prefix + name;
      let obj = {
        dataType: typeof content,
        content: content,
        type: type,
        datetime: new Date().getTime(),
      };
      if (type) window.localStorage.setItem(name, JSON.stringify(obj));
      else window.sessionStorage.setItem(name, JSON.stringify(obj));
    }

    /**
     * 获取storage
     */
    static get(params = {}) {
      if (typeof params === "string") {
        params = { name: params };
      }
      let { name, debug } = params;
      name = this.prefix + name;
      let obj = {},
        content;
      obj = window.sessionStorage.getItem(name);
      if (Util.isEmpty(obj)) obj = window.localStorage.getItem(name);
      if (Util.isEmpty(obj)) return;
      try {
        obj = JSON.parse(obj);
      } catch {
        return obj;
      }
      if (debug) {
        return obj;
      }
      if (obj.dataType == "string") {
        content = obj.content;
      } else if (obj.dataType == "number") {
        content = Number(obj.content);
      } else if (obj.dataType == "boolean") {
        content = eval(obj.content);
      } else if (obj.dataType == "object") {
        content = obj.content;
      }
      return content;
    }
    /**
     * 删除storage
     */
    static remove(params = {}) {
      if (typeof params === "string") {
        params = { name: params };
      }
      let { name, type } = params;
      name = this.prefix + name;
      if (type) {
        window.localStorage.removeItem(name);
      } else {
        window.sessionStorage.removeItem(name);
      }
    }

    /**
     * 清空SDK全部缓存，不清空整个会话，因为不能清空调用者缓存
     */
    static clear(params = {}) {
      if (typeof params === "string") {
        params = { type: params };
      }
      let { type } = params;
      if (type) {
        Object.keys(this.Keys).forEach((key) =>
          window.localStorage.removeItem(this.prefix + key)
        );
      } else {
        Object.keys(this.Keys).forEach((key) =>
          window.sessionStorage.removeItem(this.prefix + key)
        );
      }
    }
  }

  /**
   * 等待
   *
   * @param {*} delay
   * @returns
   */
  const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

  /**
   * 事件集合
   *
   */
  const EventType = {
    /**
     * ALL表示订阅所有事件，只是用来派发事件，实际上不存在该事件
     */
    ALL: "All",

    /**
     * 结果事件
     */
    RESULT_MAKE_CALL: "Result_MakeCall", //单呼结果事件
    RESULT_ADVANCE_CALL: "Result_AdvanceCall", //强呼结果事件
    RESULT_ROLL_CALL: "Result_RollCall", //点名结果事件
    RESULT_POLL_CALL: "Result_PollCall", //轮询结果事件
    RESULT_GROUP_CALL: "Result_GroupCall", //组呼结果事件
    RESULT_SELECT_CALL: "Result_SelectCall", //选呼结果事件
    RESULT_BROADCAST_CALL: "Result_BroadcastCall", //广播结果事件
    RESULT_SINGLE_TRANSFER_CALL: "Result_SingleTransferCall", //呼叫转移结果事件
    RESULT_CONSULT_CALL: "Result_CousultCall", //咨询呼叫结果事件
    RESULT_TRANSFER_CALL: "Result_TransferCall", //咨询转接结果事件
    RESULT_ANSWER_CALL: "Result_AnswerCall", //应答结果事件
    RESULT_GROUP_ANSWER_CALL: "Result_GroupAnswerCall", //群答结果事件
    RESULT_JOIN_MEET_CALL: "Result_JoinMeetCall", //加入会议结果事件
    RESULT_FORCE_INSERT_CALL: "Result_ForceInsertCall", //加入会议结果事件
    RESULT_FORCE_RELEASE_CALL: "Result_ForceReleaseCall", //强拆结果事件
    RESULT_FORCE_CLEAR_CALL: "Result_ForceClearCall", //强断结果事件
    RESULT_MONITOR_CALL: "Result_MonitorCall", //监听结果事件
    RESULT_CLEAR_CONNECTION: "Result_ClearConnection", //挂断结果事件

    /**
     * 状态事件
     */
    LOGIN_STATUS: "LoginStatus", //登录状态事件
    AGENT_STATUS_EVENT: "AgentStatusEvent", //座席状态事件
    AGENT_OFFLINE_EVENT: "AgentOfflineEvent", //座席下线事件
    CALL_CONN_STATUS_EVENT: "CallConnStatusEvent", //用户状态事件
    MEET_STATUS_EVENT_ADD: "MeetStatusEvent_Add", //会议信息事件-新增
    MEET_STATUS_EVENT_MOD: "MeetStatusEvent_Mod", //会议信息事件-修改
    MEET_STATUS_EVENT_DEL: "MeetStatusEvent_Del", //会议信息事件-删除
    MEET_MEMBER_EVENT_ADD: "MeetMemberEvent_Add", //会议成员事件-新增
    MEET_MEMBER_EVENT_DEL: "MeetMemberEvent_Del", //会议成员事件-删除
    MEET_ASK_SPEAK_EVENT: "MeetAskSpeakEvent", //举手发言事件
    CALL_QUEUE_STATUS_EVENT: "CallQueueStatusEvent", //用户呼入事件
    VIDEO_DISPENSE_EVENT: "VideoDispenseEvent", //视频分发事件
    VIDEO_STATUS_EVENT: "VideoStatusEvent", //视频实时状态事件
    SMS_DATA_EVENT_STATUS: "SmsDataEvent_Status", //短信状态事件事件
    SMS_DATA_EVENT_NEW: "SmsDataEvent_New", //新短信事件
    SMS_READ_STATUS: "SmsReadStatus", //短信已读事件
    SMS_GROUP_EVENT_ADD: "smsGroupAdd", //群组信息事件-新增
    SMS_GROUP_EVENT_MOD: "smsGroupMod", //群组信息事件-修改
    SMS_GROUP_EVENT_DEL: "smsGroupDel", //群组信息事件-删除
    SMS_GROUP_EVENT_CONTACTADD: "smsGroupContactAdd", //群组信息事件-添加人员
    SMS_GROUP_EVENT_CONTACTDEL: "smsGroupContactDel", //群组信息事件-删除人员
    FAX_DATA_EVENT_STATUS: "FaxDataEvent_Status", //传真状态事件
    FAX_DATA_EVENT_NEW: "FaxDataEvent_New", //新传真事件
    FAX_DATA_EVENT_DEL: "FaxDataEvent_Del", //传真删除事件
    FAX_DATA_EVENT_READ: "FaxDataEvent_Read", //传真已读事件
    LOCATION_NOTIFY_EVENT: "LocationNotifyEvent", //实时定位上报事件
    BLACKLIST_EVENT_ADD: "BlackListEvent_Add", //黑名单添加上报事件
    BLACKLIST_EVENT_MOD: "BlackListEvent_Mod", //黑名单修改上报事件
    BLACKLIST_EVENT_DEL: "BlackListEvent_Del", //黑名单删除上报事件

    /**
     * 数据事件
     */
    GROUP_EVENT_ADD: "GroupEvent_Add", //部门事件-新增
    GROUP_EVENT_MOD: "GroupEvent_Mod", //部门事件-修改
    GROUP_EVENT_DEL: "GroupEvent_Del", //部门事件-删除
    OPERATOR_EVENT_ADD: "OperatorEvent_Add", //调度员事件-新增
    OPERATOR_EVENT_MOD: "OperatorEvent_Mod", //调度员事件-修改
    OPERATOR_EVENT_DEL: "OperatorEvent_Del", //调度员事件-删除
    EMPLOYEE_EVENT_ADD: "EmployeeEvent_Add", //职员事件-新增
    EMPLOYEE_EVENT_MOD: "EmployeeEvent_Mod", //职员事件-修改
    EMPLOYEE_EVENT_DEL: "EmployeeEvent_Del", //职员事件-删除
    VIDEO_GROUP_EVENT_ADD: "VideoGroupEvent_Add", //监控分组事件-新增
    VIDEO_GROUP_EVENT_MOD: "VideoGroupEvent_Mod", //监控分组事件-修改
    VIDEO_GROUP_EVENT_DEL: "VideoGroupEvent_Del", //监控分组事件-删除
    VIDEO_INFO_EVENT_ADD: "VideoInfoEvent_Add", //监控节点事件-新增
    VIDEO_INFO_EVENT_MOD: "VideoInfoEvent_Mod", //监控节点事件-修改
    VIDEO_INFO_EVENT_DEL: "VideoInfoEvent_Del", //监控节点事件-删除

    /**
     * RTCStream事件
     */
    RTC_STREAM_SESSION_EVENT: "rtcStreamSessionEvent", //rtcStream session事件
  };

  /**
   * 视频分辨率
   */
  const VideoResolutionQuality = {
    VIDEO_QUALITY_720P: { width: 1280, height: 720 }, //默认
    VIDEO_QUALITY_1080P: { width: 1920, height: 1080 },
    VIDEO_QUALITY_480P: { width: 854, height: 480 },
    VIDEO_QUALITY_180P: { width: 320, height: 240 },
  };

  /**
   * 视频帧率
   */
  const VideoFrameRate = {
    VIDEO_FRAME_RATE_20: 20, //默认
    VIDEO_FRAME_RATE_25: 25,
    VIDEO_FRAME_RATE_15: 15,
    VIDEO_FRAME_RATE_10: 10,
    VIDEO_FRAME_RATE_5: 5,
  };

  /**
   * 数据操作类型
   */
  const DataAction = {
    ACTION_ADD: "add", //新增
    ACTION_UPDATE: "update", //修改
    ACTION_DELETE: "delete", //删除
    ACTION_SET: "set", //设置
    ACTION_GET: "get", //查询
    ACTION_LIST: "list", //查询列表
    ACTION_LISTID: "listid", //查询id列表
    ACTION_LISTSUB: "listsub", //查询子列表
    ACTION_COUNT: "count", //查询数量
    ACTION_LIST_RELATION: "listrelation", //查询权限组绑定组信息
    ACTION_LIST_RIGHT: "listright", //查询权限组绑定权限信息
  };

  /**
   * 双工模式
   *
   */
  const DuplexMode = {
    FULL: "full", //全双工
    HALF: "half", //半双工
  };

  /**
   * 呼叫类型
   *
   */
  const CallType = {
    AUDIO: "audio", //语音
    VIDEO: "video", //视频
  };

  /**
   * 会议类型
   */
  const MeetMode = {
    VIDEO: "video", //视频
    AUDIO: "audio", //语音
  };

  /**
   * 是否为呼入会议
   */
  const CallinState = {
    NO: 0, //否
    YES: 1, //是
  };

  /**
   * 呼叫方式
   *
   */
  const CallMode = {
    SERIAL: "serial", //顺序呼叫
    PARALLEL: "parallel", //同时呼叫
  };

  /**
   * 广播模式
   *
   */
  const BroadcastMode = {
    MANUAL: "manual", //人工语音
    FILE: "file", //语音文件
    TTS: "tts", //文本文字
  };

  /**
   * 手柄类型
   *
   */
  const HandType = {
    PHONE: "phone", //话机
    HAND_MICROPHONE: "hand_microphone", //手咪
  };

  /**
   * 坐席类型
   *
   */
  const UserType = {
    OPERATOR: "operator", //普通坐席
    MONITOR: "monitor", //班长坐席
  };

  /**
   * 值班功能
   *
   */
  const OnDuty = {
    FALSE: false, //关闭
    TRUE: true, //开启
  };

  /**
   * 组类型
   *
   */
  const GroupType = {
    ORGAN: "organ", //普通组
    DISPATCH_GROUP: "dispatchgroup", //调度组
  };

  /**
   * 号码类型
   */
  const DeviceType = {
    OFFICE: "office", //办公号码
    HOME: "home", //家庭号码
    MOBILE: "mobile", //手机号码
    FAX: "fax", //传真号码
    LINKAGE: "linkage", //联动号码
    WIRELESS: "wireless", //无线终端
    POCGROUP: "pocgroup", //集群群组
    POC: "poc", //集群号码
    SOLDIER: "soldier", //单兵终端
    VIDEO: "video", //视频终端
  };

  /**
   * 号码状态
   *
   */
  const DeviceState = {
    IDLE: "idle", // 空闲
    READY: "ready", // 呼叫中
    RING: "ring", // 振铃
    TALK: "talk", // 通话中
    HOLD: "hold", // 保持
    QUEUE: "queue", // 呼入排队
    CALL_FAIL: "callfail", // 呼叫失败
    BROADCAST: "broadcast", // 广播
    ALLOW_SPEAK: "allowspeak", // 允许发言
    BAN_SPEAK: "banspeak", // 禁止发言
    SINGLE_TALK: "singletalk", // 单独通话
    OFFLINE: "offline", // 离线
    MONITOR_RING: "monitoring", // 监测振铃
    MONITOR_TALK: "monitortalk", // 监测通话
    CALLIN: "callin", // 呼入
  };

  /**
   * 是否
   */
  const YesOrNo = {
    YES: "yes",
    NO: "no",
  };

  /**
   * 值班值守模式
   */
  const UnattendMode = {
    OPEN: "open",
    CLOSE: "close",
  };
  /**
   * 坐席状态
   */
  const AgentState = {
    LOGOUT: "logout", //登出
    LOGIN: "login", //已登录（开班状态）
    WORKING_AFTER_CALL: "workingaftercall", //无人值守
    STOP: "stop", //关班
  };

  /**
   * 客户端连接状态信息
   */
  const ConnectionAgentState = {
    DISCONNECTED: "Disconnected", //连接断开，未登录状态
    CONNECTING: "Connecting", //正在连接中
    CONNECTED_WORKSTART: "Connected-WorkStart", //已连接，登录成功，开班状态
    CONNECTED_WORKSTOP: "Connected-WorkStop", //已连接，关班状态
    CONNECTED_WORKAFTERCALL: "Connected-WorkAfterCall", //已连接，无人值守状态
    RECONNECTING: "ReConnecting", //正在重连中
  };
  /**
   * 客户端连接断开原因
   */
  const ConnectionDisconnectedReason = {
    DISCONNECTED_NONE: "DISCONNECTED_NONE", //缺省
    DISCONNECTED_LEAVE: "DISCONNECTED_LEAVE", //用户正常退出
    DISCONNECTED_OFFLINE: "DISCONNECTED_OFFLINE", //用户被下线
    DISCONNECTED_ERROR: "DISCONNECTED_ERROR", //服务器返回错误，比如重连的密码错误
  };

  /**
   * 传真短信状态
   */
  const SmsStatus = {
    UNREAD: "unread", //未读
    READ: "read", //已读
    SENDING: "sending", //发送中
    SEND_SUCC: "send succ", //发送成功
    SEND_FAIL: "send fail", //发送失败
    DEL: "del", //删除
    SENDED_UNREAD: "sended unread", //已发送未读
    SENDED_READ: "sended read", //已发送已读
  };

  /**
   * 清空客服端数据
   */
  const clearCLient = (errCode) => {
    if (DispRTC.client) {
      DispRTC.client.wsClient && DispRTC.client.wsClient.close();
      DispRTC.client.operatorInfo = null;
      DispRTC.client._setToken(null, errCode);

      Timer.clearTimer();
      RTCStream.destroy();
      if (errCode === 403 && DispRTC.client.reLogin) {
        DispRTC.client.log.warn(
          "DispRTC.client.reLogin",
          DispRTC.client.reLogin
        );
        !DispRTC.client.isReLogining && DispRTC.client._reLogin();
      } else {
        Store.clear();
      }
    } else {
      Timer.clearTimer();
      RTCStream.destroy();
      Store.clear();
    }
  };

  /**
   * RTCSteanm事件类型
   */
  const RTCStreamEventType = {
    STARTING: "starting",
    STARTED: "started",
    CONNECTING: "connecting",
    LOGIN: "login",
    CALLING: "calling",
    MAKE_CALL: "make_call",
    RING: "ring",
    ANSWER: "answer",
    HANGUP: "hangup",
    LOGOUT: "logout",
    DTMF: "dtmf",
    PTT_REQUEST: "ptt_request",
    PTT_RELEASE: "ptt_release",
    HEART: "heart",

    ON_NEW_CALL: "on_new_call",
    ON_RING: "on_ring",
    ON_RING_183: "on_ring_183",
    ON_ANSWER: "on_answer",
    ON_HANGUP: "on_hangup",
    ON_PTT_REQUEST: "on_ptt_request",
    ON_PTT_RELEASE: "on_ptt_release",

    ON_DISCONNECT: "on_disconnect",
  };

  const CALL_DIRECTION = {
    IN: 0,
    OUT: 1,
  };

  const CALL_TYPE = {
    AUDIO: "call-audio",
    VIDEO: "call-audiovideo",
    HALF_AUDIO: "call-halfaudio",
  };

  /**
   * 软电话
   */
  class RTCStream {
    static LOG = Logger.prefix("RTCStream");
    static instances = new Map(); // 已实例化的对象
    static audioRemote; // 远程语音
    static isInited = false; // 是否初始化
    static webrtc2SipEnabled = false; // 是否启用
    static EventType = RTCStreamEventType;
    static audioInput = "default"; //麦克风设备ID
    static audioOutput = "default"; //扬声器设备ID
    static videoInput = ""; //摄像头设备ID

    // 获取已实例化的Webrtc2Sip对象
    static getInstances() {
      return [...this.instances.values()];
    }

    // 获取已实例化的Webrtc2Sip对象
    static getInstanceByName(name) {
      return this.instances.get(name);
    }

    static hangUp() {
      if (!this.instances) return;
      for (const item of this.instances.values()) {
        item.sipHangUp();
      }
    }

    // 销毁Webrtc2Sip所有实例
    static destroy() {
      if (!this.instances) return;
      for (const item of this.instances.values()) {
        item._unRegister();
      }
    }

    /**
     * 设置默认设备
     * @param {string} audioInput 麦克风
     * @param {string} audioOutput 扬声器
     * @param {string} videoInput 摄像头
     */
    static setDefaultDevice({ audioInput, audioOutput, videoInput } = {}) {
      this.audioInput = audioInput || "default";
      this.audioOutput = audioOutput || "default";
      this.videoInput = videoInput || "";
      Store.set({
        name: Store.Keys.defaultDevice,
        type: "local",
        content: {
          audioInput: this.audioInput,
          audioOutput: this.audioOutput,
          videoInput: this.videoInput,
        },
      });
    }
    /**
     * 获取默认设备
     */
    static getDefaultDevice() {
      return (
        Store.get("default-device") || {
          audioInput: "default",
          audioOutput: "default",
          videoInput: "",
        }
      );
    }

    /**
     * 构造函数
     * @param {*} containers
     * @param {*} sessionEvent
     */
    constructor(options = {}) {
      //初始化设备信息
      RTCStream.setDefaultDevice(RTCStream.getDefaultDevice());

      this.client = options.client;
      this.handleType = options.handleType; //手柄类型，左右手柄
      this.phone = options.phone; //号码
      this.password = options.password; //密码
      this.name = options.phone; // webrtc2sip名称，用号码表示
      this.autoAccept = options.autoAccept || false;
      this.wsServer = options.wsServer; //websocket服务器
      this.iceServers = null;
      this.frameRate = options.frameRate || 30;
      this.resolution = options.resolution || 1280;
      this.videoFrameRate = options.frameRate || 30;
      this.videoResolution = options.frameRate || 1280;
      //设备信息
      this.cameraId = options.cameraId;
      this.microphoneId = options.microphoneId;
      this.speakerId = options.speakerId;

      this.isInited = false;
      this.loginFail = false;

      this.videoRemote = null; // 远端视频
      this.videoLocal = null; // 本地视频
      this.webrtcStackNode = null;

      this.websocketServer = null;
      this.iceservers = null;
      this.callType = null;
      this.called = null;
      this.requestTel = null;

      //录音
      this.mediaRecorder = null;
      this.recordedBlobs = [];

      /**
       * 事件
       */
      this.eventMap = {}; //事件集合
      this.onceEventMap = {}; // 单次事件集合，只执行一次
      this.event = new Proxy(
        {},
        {
          set: (target, property, fn) => {
            this.eventMap[property] || (this.eventMap[property] = []);
            //同一个事件和同一个回调函数不再添加
            !this.eventMap[property].some((f) => f == fn) &&
              this.eventMap[property].push(fn);
            return true;
          },
        }
      );
      this.onceEvent = new Proxy(
        {},
        {
          set: (target, property, fn) => {
            this.onceEventMap[property] || (this.onceEventMap[property] = []);
            //同一个事件和同一个回调函数不再添加
            !this.onceEventMap[property].some((f) => f == fn) &&
              this.onceEventMap[property].push(fn);
            return true;
          },
        }
      );
    }

    /**
     * 序列化
     */
    toJSON() {
      return JSON.stringify({
        handleType: this.handleType,
        name: this.name,
        autoAccept: this.autoAccept,
        callType: this.callType,
        called: this.called,
        requestTel: this.requestTel,
      });
    }

    /**
     * 绑定事件
     * @param {String} name 事件名称
     * @param {Function} fn 回调函数
     */
    on(name, fn) {
      if (name && typeof fn === "function") {
        let onFns = this.eventMap[name];
        if (!onFns || !onFns.some((f) => f == fn)) {
          this.event[name] = fn;
        }
      }
      return this;
    }

    /**
     * 移除事件
     * @param {String} name 事件名称
     * @param {Function} fn 存在则移除与该回调函数相关的事件
     */
    off(name, fn) {
      if (name) {
        if (fn) {
          let funs = this.eventMap[name];
          let index;
          if (funs && (index = funs.findIndex((f) => f == fn)) != -1) {
            funs.splice(index, 1);
          }
        } else {
          delete this.eventMap[name];
          delete this.onceEventMap[name];
        }
      }
      return this;
    }

    /**
     * 派发事件，即回调, 所有事件都会派发到client订阅的所有事件
     * @param {String} name 事件名
     * @param  {...any} val 消息
     */
    emit(name, val) {
      try {
        this.eventMap[name] &&
          this.eventMap[name].forEach((fn) => {
            fn(val, this);
          });
        //派发给客户端ALL事件
        this.client?.eventMap[EventType.ALL] &&
          this.client.eventMap[EventType.ALL].forEach((fn) => {
            fn({
              eventType: EventType.RTC_STREAM_SESSION_EVENT,
              data: { event: val, rtcStream: this },
            });
          });
      } catch (error) {
        RTCStream.LOG.error("派发事件失败", error);
      }
    }

    /**
     * 设置本地注册账号信息
     *
     * @param {String} phone 号码
     * @param {String} password 密码
     */
    setRegisterProfile(phone, password) {
      if (Util.isEmpty(phone) || Util.isEmpty(password)) {
        return R.toReject(ErrCode.NUMBER_OR_PWD_EMPTY);
      }
      this.phone = phone;
      this.password = password;
      this.name = phone;
      return R.toResolve();
    }

    /**
     * 设置屏幕共享的属性
     * 必须在RTCStream.init之前调用
     *
     * @param {Number} frameRate 帧率
     * @param {Number} resolution 分辨率
     */
    setScreenProfile(frameRate, resolution) {
      if (frameRate) {
        if (!Number.isInteger(frameRate) || frameRate < 1) {
          return R.toReject(ErrCode.FRAMERATE_IS_POSITIVE_INTEGER);
        }
        this.frameRate = frameRate;
      }
      if (resolution) {
        if (!Number.isInteger(resolution) || resolution < 1) {
          return R.toReject(ErrCode.RESOLUTION_IS_POSITIVE_INTEGER);
        }
        this.resolution = resolution;
      }
      return R.toResolve();
    }

    /**
     * 设置摄像头视频属性
     * 必须在RTCStream.init之前调用
     *
     * @param {Number} frameRate 帧率
     * @param {Number} resolution 分辨率
     */
    setVideoProfile(frameRate, resolution) {
      if (frameRate) {
        if (!Number.isInteger(frameRate) || frameRate < 1) {
          return R.toReject(ErrCode.FRAMERATE_IS_POSITIVE_INTEGER);
        }
        this.videoFrameRate = frameRate;
      }
      if (resolution) {
        if (!Number.isInteger(resolution) || resolution < 1) {
          return R.toReject(ErrCode.RESOLUTION_IS_POSITIVE_INTEGER);
        }
        this.videoResolution = resolution;
      }
      return R.toResolve();
    }

    /**
     * 初始化本地音视频对象，并且向服务器去注册
     *
     */
    async init() {
      if (!RTCStream.audioRemote) {
        var audio = new Audio();
        audio.controls = false; //不显示控件按钮
        document.body.appendChild(audio); //把它添加到页面中
        RTCStream.audioRemote = audio;
      }

      if (Util.isEmpty(this.phone) || Util.isEmpty(this.password)) {
        return R.toReject(ErrCode.NUMBER_OR_PWD_EMPTY);
      }
      return await this._register()
        .then((res) => {
          this.isInited = true;
          return R.resolve();
        })
        .catch((err) => {
          this.isInited = false;
          return R.reject(err);
        });
    }

    /**
     * 销毁本地音视频对象
     */
    destroy() {
      this._unRegister();
      return R.resolve();
    }

    /**
     * 打开视频输入设备, 如摄像头或屏幕共享。并且发布出去
     *
     * 当打开新的输入设备时，SDK会自动关闭旧的输入设备
     *
     * options:{deviceId?:string; screenId?:string}
     */
    async open(options = {}) {
      let { deviceId, screenId } = options;
      // if (Util.isEmpty(deviceId) || Util.isEmpty(screenId)) {
      //   return R.toReject(ErrCode.DEVICE_IS_EMPTY)
      // }
      if (deviceId) {
        await navigator.mediaDevices
          .getUserMedia({
            video: {
              deviceId: deviceId,
              width: { exact: 1280 },
              height: { exact: 720 },
            },
            audio: { noiseSuppression: true, echoCancellation: true },
          })
          .then((stream) => {
            this._getVideoMediaSucc(stream);
          })
          .catch((err) => {
            RTCStream.LOG.error(`getUserMedia error: ${err.name}`, err);
            return R.toReject(ErrCode.ENUMERATE_DEVICES_FAILED);
          });
      } else {
        await navigator.mediaDevices
          .getDisplayMedia({
            video: { deviceId: screenId, width: 1280, height: 720 },
            audio: { noiseSuppression: true, echoCancellation: true },
          })
          .then((stream) => {
            this._getVideoMediaSucc(stream);
          })
          .catch((err) => {
            RTCStream.LOG.error(`getDisplayMedia error: ${err.name}`, err);
            return R.toReject(ErrCode.ENUMERATE_DEVICES_FAILED);
          });
      }
      return R.resolve();
    }

    /**
     * 关闭视频输入设备
     */
    close() {
      this.localStream &&
        (this.localStream.getTracks().forEach((e) => e.stop()),
        (this.localStream = null));

      this.localElement && this.localElement.pause();

      this.localStreamPlaying = false;
      this.localStreamAudioPlaying = false;
      this.localStreamVideoPlaying = false;

      return R.resolve();
    }

    /**
     * 播放音视频流
     *
     * view:HTMLElement, options:{audio?:boolean; video?:boolean}
     */
    play(view, options = {}) {
      if (!view || !(view instanceof HTMLElement))
        return R.toReject(ErrCode.PAMARA_INVALID);
      if (!this.localStream) return R.toReject(ErrCode.DEVICE_NOT_OPEN);

      if (options.audio && options.video) {
        view.srcObject = this.localStream;
        this.localStreamPlaying = true;
      } else if (options.audio) {
        view.srcObject = new MediaStream(this.localStream.getAudioTracks());
        this.localStreamAudioPlaying = true;
      } else {
        view.srcObject = new MediaStream(this.localStream.getVideoTracks());
        this.localStreamVideoPlaying = true;
      }

      view.play();

      return R.resolve();
    }

    /**
     * 停止音视频流
     *
     */
    stop() {
      this.localElement && this.localElement.pause();

      this.localStreamPlaying = false;
      this.localStreamAudioPlaying = false;
      this.localStreamVideoPlaying = false;
      return R.resolve();
    }

    /**
     * 返回音视频当前是否在播放状态
     * type: “audio”|“video”
     */
    isPlaying(type) {
      if (!this.localStream) return false;
      if (type === "audio") {
        return this.localStreamPlaying || this.localStreamAudioPlaying;
      }
      if (type === "video") {
        return this.localStreamPlaying || this.localStreamVideoPlaying;
      }
      return false;
    }

    /**
     * 是否视频通话
     */
    hasVideo() {
      return this.callType === "audio/video";
    }

    /**
     * 静音 麦克风
     */
    mute() {
      this.webrtcStackNode &&
        this.webrtcStackNode.localStream &&
        this.webrtcStackNode.localStream
          .getAudioTracks()
          .forEach((e) => (e.enabled = false));
      return R.resolve();
    }

    /**
     * 取消静音 麦克风
     */
    unmute() {
      this.webrtcStackNode &&
        this.webrtcStackNode.localStream &&
        this.webrtcStackNode.localStream
          .getAudioTracks()
          .forEach((e) => (e.enabled = true));
      return R.resolve();
    }

    /**
     * 关闭摄像头
     */
    stopCamera() {
      this.webrtcStackNode &&
        this.webrtcStackNode.localStream &&
        this.webrtcStackNode.localStream
          .getVideoTracks()
          .forEach((e) => (e.enabled = false));
      return R.resolve();
    }

    /**
     * 打开摄像头
     */
    openCamera() {
      this.webrtcStackNode &&
        this.webrtcStackNode.localStream &&
        this.webrtcStackNode.localStream
          .getVideoTracks()
          .forEach((e) => (e.enabled = true));
      return R.resolve();
    }

    /**
     * 截图
     */
    takeSnapshot() {
      if (!this.localStream) return R.toReject(ErrCode.DEVICE_NOT_OPEN);

      const track = this.localStream.getVideoTracks()[0];
      const imageCapture = new ImageCapture(track);
      imageCapture
        .takePhoto()
        .then((blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.style.display = "none";
          a.href = url;
          a.download = `${new Date()
            .toLocaleDateString()
            .replaceAll("/", "-")}-${new Date()
            .toLocaleTimeString()
            .replaceAll(":", "-")}-screenshot.png`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          }, 100);
        })
        .catch((error) => {
          RTCStream.LOG.error("takePhoto() error: ", error);
        });

      return R.resolve();
    }

    /**
     * 开始本地录像
     */
    startMediaRecording() {
      if (!this.localStream && this.isPlaying())
        return R.toReject(ErrCode.DEVICE_NOT_OPEN);
      const options = { mimeType: getSupportedMimeType() };
      try {
        const mediaRecorder = (this.mediaRecorder = new MediaRecorder(
          this.localStream,
          options
        ));
        mediaRecorder.onstop = (event) => {
          RTCStream.LOG.info("Recorder stopped: ", event);
        };
        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            this.recordedBlobs.push(event.data);
          }
        };
        this.recordedBlobs = [];
        mediaRecorder.start();
        RTCStream.LOG.info("MediaRecorder started", mediaRecorder);
      } catch (e) {
        RTCStream.LOG.error("Exception while creating MediaRecorder:", e);
        return R.toReject(ErrCode.MEDIA_RECORDER_CREATE_FAILED);
      }
      return R.resolve();
    }

    /**
     * 停止本地录像
     */
    stopMediaRecording() {
      if (this.mediaRecorder) {
        this.mediaRecorder.stop();

        if (this.mediaRecorder) {
          const mimeType = getSupportedMimeType().split(";", 1)[0];
          const blob = new Blob(this.recordedBlobs, { type: mimeType });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.style.display = "none";
          a.href = url;
          a.download = "test.webm";
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          }, 100);

          this.mediaRecorder = null;
          this.recordedBlobs = [];
        }
      }

      return R.resolve();
    }

    /**
     * 获取视频流成功
     * @param {*} stream
     * @returns
     */
    _getVideoMediaSucc(stream) {
      this.localStream && this.localStream.getTracks().forEach((e) => e.stop());

      this.localStream = stream;
      if (this.localElement) {
        this.localElement.srcObject = stream;
        this.localElement.muted = true;
        this.localElement.play();

        this.localStreamPlaying = true;
      }

      stream.getTracks().forEach((track) => {
        this.webrtcStackNode.PC &&
          this.webrtcStackNode.PC.addTrack(track, stream);
      });

      stream.getVideoTracks()[0].addEventListener("ended", () => {
        RTCStream.LOG.warn("屏幕共享结束");
        this.localStream === stream && this.close();
      });

      if (!this.isSupportH264()) return;

      try {
        const supportsSetCodecPreferences =
          window.RTCRtpTransceiver &&
          "setCodecPreferences" in window.RTCRtpTransceiver.prototype;
        if (supportsSetCodecPreferences) {
          const { codecs } = RTCRtpSender.getCapabilities("video");
          const selectedCodecIndex = codecs.findIndex(
            (c) =>
              c.mimeType === "video/H264" &&
              c.sdpFmtpLine.includes("packetization-mode=1") &&
              c.sdpFmtpLine.includes("profile-level-id=42e01f")
          );
          const selectedCodec = codecs[selectedCodecIndex];
          codecs.splice(selectedCodecIndex, 1);
          codecs.unshift(selectedCodec);

          const transceiver = this.webrtcStackNode.PC.getTransceivers().find(
            (t) => t.sender && t.sender.track === stream.getVideoTracks()[0]
          );
          if (transceiver) {
            transceiver.setCodecPreferences(codecs);
          }
        } else {
          RTCStream.LOG.warn("浏览器Webrtc不支持设置视频编码");
        }
      } catch (error) {
        RTCStream.LOG.warn("不支持设置编码", error);
      }
    }

    /**
     * 注册
     * @param {Object} options
     */
    _register() {
      // try {
      this.iceservers = this.iceServers ? this.iceServers.split(",") : [];

      if (this.iceservers.length > 0) {
        this.iceservers.forEach((item, index, array) => {
          array[index] = "stun:" + item;
        });
      }

      if (this.webrtcStackNode != null) {
        this.webrtcStackNode.exit();
      }

      this.webrtcStackNode = new RTCStream.WebrtcStack(
        this,
        this.wsServer,
        this.phone,
        this.password,
        (event) => {
          this.webrtcstackCallback.call(this, event);
        },
        this.iceservers,
        this.client
      );
      RTCStream.instances.set(this.phone, this);
      RTCStream.webrtc2SipEnabled = true;

      return Promise.resolve(R.ok());
      // } catch (e) {
      //   RTCStream.LOG.error(`软电话:${this.name}注册失败`, e)
      //   this._unRegister()
      //   this.webrtcStackNode = null
      //   return R.toReject(ErrCode.SOFTPHONE_RIGISTER_ERROR)
      // }
    }

    /**
     * 取消注册
     * @returns
     */
    _unRegister() {
      RTCStream.instances.delete(this.name);
      if (this.webrtcStackNode == null) {
        return;
      }
      this.webrtcStackNode.exit();
    }

    sipCall(callType, phoneNumber) {
      var hasVideo = false;
      var hasHalf = false;
      var local = null;
      var remote = null;

      if (this.webrtcStackNode == null) {
        return false;
      }

      if (!phoneNumber) {
        return false;
      }

      if (callType === CALL_TYPE.AUDIO) {
        this.callType = "audio";
        remote = RTCStream.audioRemote;
      } else if (callType === CALL_TYPE.HALF_AUDIO) {
        hasHalf = true;
        this.callType = "half/audio";
        remote = RTCStream.audioRemote;
      } else if (callType === CALL_TYPE.VIDEO) {
        this.callType = "audio/video";
        hasVideo = true;
        remote = this.videoRemote;
        local = this.videoLocal;
      } else {
        return false;
      }
      this.sessionEventFun({
        type: RTCStreamEventType.CALLING,
        description: "Call in progress...",
      });
      this.webrtcStackNode.call(phoneNumber, local, remote, hasVideo, hasHalf);
      return true;
    }

    sipHangUp() {
      if (this.webrtcStackNode == null) {
        console.error("sipHangUp");
        return;
      }
      this.clearVideoDom();
      this.webrtcStackNode.hangup();
      return true;
    }

    switchCamera(e) {
      const self = this;

      if (self.webrtcStackNode.localStream) {
        self.webrtcStackNode.localStream.getTracks().forEach((track) => {
          track.stop();
        });
      }
      let config = {};
      if (e == "after") {
        config = {
          audio: { echoCancellation: true, noiseSuppression: true },
          video: {
            width: { exact: 1280 },
            height: { exact: 720 },
            advanced: [{ facingMode: { exact: "environment" } }],
          },
        };
      } else if (e == "before") {
        config = {
          audio: { echoCancellation: true, noiseSuppression: true },
          video: {
            width: { exact: 1280 },
            height: { exact: 720 },
            advanced: [{ facingMode: { exact: "user" } }],
          },
        };
      }
      navigator.mediaDevices
        .getUserMedia(config)
        .then(function (stream) {
          let videoTrack = stream.getVideoTracks()[0];
          let audioTrack = stream.getAudioTracks()[0];

          var sender = self.webrtcStackNode.PC.getSenders().find(
            (s) => s.track.kind == videoTrack.kind
          );
          var sender2 = self.webrtcStackNode.PC.getSenders().find(
            (s) => s.track.kind == audioTrack.kind
          );

          sender.replaceTrack(videoTrack);
          sender2.replaceTrack(audioTrack);

          self.webrtcStackNode.localStream = stream;

          self.webrtcStackNode.localElement.srcObject = stream;

          self.webrtcStackNode.localElement.play();
          self.webrtcStackNode.localElement.muted = true;
        })
        .catch(function (err) {});
    }
    /**
     * 接听电话
     * @param {*} param0
     * @returns
     */
    sipAnswer({ videoRemote, videoLocal, callType } = {}) {
      if (this.webrtcStackNode == null) {
        return false;
      }

      callType ??= this.callType;

      if (callType === "video" || callType === "audio/video") {
        videoLocal =
          videoLocal instanceof HTMLElement
            ? videoLocal
            : document.getElementById(videoLocal);
        videoRemote =
          videoRemote instanceof HTMLElement
            ? videoRemote
            : document.getElementById(videoRemote);
        this.webrtcStackNode.answer(
          videoLocal || this.videoLocal,
          videoRemote || this.videoRemote || RTCStream.audioRemote
        );
      } else {
        this.webrtcStackNode.isVideo = false;
        this.webrtcStackNode.answer(null, RTCStream.audioRemote);
      }
      this.sessionEventFun({
        type: RTCStreamEventType.ON_ANSWER,
        description: "In Call",
      });
      return true;
    }

    sipRequest() {
      if (this.webrtcStackNode == null) {
        return;
      }

      this.webrtcStackNode.pttrequest();

      return true;
    }
    sipRelease() {
      if (this.webrtcStackNode == null) {
        return;
      }

      this.webrtcStackNode.pttrelease();
      return true;
    }

    sipDtmf(dtmfValue) {
      if (this.webrtcStackNode == null) {
        return;
      }

      this.webrtcStackNode.dtmf();
      return true;
    }

    getCallType() {
      return this.callType;
    }

    getCallName() {
      return this.called ? this.called : "未知";
    }

    getRequestName() {
      return this.requestTel ? this.requestTel : "未知";
    }

    sessionEventFun(event) {
      RTCStream.LOG.info(
        "-------sessionEventFun--------",
        JSON.stringify(event)
      );
      if (this.client && this.client._isLogin()) this.emit(event.type, event);
    }

    webrtcstackCallback(msg) {
      switch (msg.type) {
        case RTCStreamEventType.LOGIN:
          if (msg.result === false) {
            RTCStream.LOG.warn(`软电话：${this.name}注册失败`, msg);
            this.loginFail = true;
          } else {
            RTCStream.LOG.info(`软电话：${this.name}注册成功`);
            this.client.telStatus[this.name] = DeviceState.IDLE;
            this.client.emit(EventType.ALL, {
              eventType: EventType.CALL_CONN_STATUS_EVENT,
              data: { localDevice: this.name, localState: DeviceState.IDLE },
            });
          }
          break;
        case RTCStreamEventType.ON_HANGUP:
          this.clearVideoDom();
          break;
        case RTCStreamEventType.ON_NEW_CALL:
          this.called = msg.from;
          if (msg.isvideo) {
            this.callType = "audio/video";
          } else if (msg.ishalf) {
            this.callType = "half/audio";
          } else {
            this.callType = "audio";
          }
          break;
        case RTCStreamEventType.ON_PTT_REQUEST:
          this.requestTel = msg.tel;
          break;
        case RTCStreamEventType.ON_DISCONNECT:
          this._unRegister();
          this.client.telStatus[this.name] = DeviceState.OFFLINE;
          this.client.emit(EventType.ALL, {
            eventType: EventType.CALL_CONN_STATUS_EVENT,
            data: { localDevice: this.name, localState: DeviceState.OFFLINE },
          });
          RTCStream.LOG.warn(
            `软电话:${this.name}与服务器断开连接`,
            this.client.telStatus
          );
          break;
      }
      this.sessionEventFun(msg);
    }
    // 是否启用webrtc2sip
    static isEnabled() {
      return this.webrtc2SipEnabled;
    }
    /**
     * 根据号码判断是否启用
     * @param {String} name 号码
     */
    static isExistForName(name) {
      return this.getInstanceByName(name) ? true : false;
    }

    /**
     * 清除播放dom
     */
    clearVideoDom() {
      this.videoLocal = null;
      this.videoRemote = null;
    }
  }

  RTCStream.WebrtcStack = class {
    static LOG = Logger.prefix("RTCStream.WebrtcStack");

    constructor(
      rtcStream,
      wsurl,
      tel,
      passwd,
      sessionEvent,
      iceservers,
      client
    ) {
      /**
       * 日志打印
       */
      this.log = RTCStream.WebrtcStack.LOG;

      if (!wsurl.endsWith("/")) {
        wsurl = wsurl + "/";
      }
      //连接重试次数
      this.rtcStream = rtcStream;
      this.client = client;
      this.wsurl = wsurl + "webrtcMedia";
      this.tel = tel;
      this.passwd = passwd;
      this.WSStatus = false;
      this.onMessage = sessionEvent;

      this.heartTimeout = 2000;

      this.regStatus = false;

      this.PC = null;
      this.callStatus = false;
      this.isVideo = false;
      this.localStream = null;
      this.localElement = null;
      this.remoteElement = null;
      this.isHalf = false;
      this.callDirection = CALL_DIRECTION.OUT;
      this.remoteSdp = null;
      this.setRemoteSdp = false;

      this.ringbacktone = new Audio("../sounds/ringbacktone.wav");
      this.ringbacktone.autoplay = false;
      this.ringbacktone.loop = true;
      this.ringbacktone.muted = true;
      this.ringbacktone.addEventListener("play", () => {
        this.ringbacktone.muted = false;
      });

      this.ringtone = new Audio("../sounds/ringtone.wav");
      this.ringtone.autoplay = false;
      this.ringtone.loop = true;
      this.ringtone.muted = true;
      this.ringtone.addEventListener("play", () => {
        this.ringtone.muted = false;
      });

      this.notify({ type: "starting", description: "Stack starting" });

      this.WS = new WebSocket(this.wsurl);
      this.interval = null;
      //重连定时器
      this.reconnectTimer = null;

      if (iceservers.length > 0) {
        this.config = {
          iceServers: [{ urls: iceservers }],
        };
      } else {
        this.config = {
          iceServers: [],
        };
      }

      this.WS.onopen = () => {
        this.log.warn("ws connect succ.");
        this.notify({ type: "started", description: "Stack started" });
        this.WSStatus = true;
        this.notify({ type: "connecting", description: "connecting" });
        this.login();
      };
      this.WS.onclose = (ev) => {
        this.log.warn(
          "ws connect close.",
          JSON.stringify(ev),
          this.rtcStream.loginFail
        );
        this.WSStatus = false;
        this.regStatus = false;
        this.callStatus = false;
        if (this.interval) {
          clearInterval(this.interval);
          this.interval = null;
        }
        this.notify({ type: RTCStreamEventType.ON_DISCONNECT });
        this.reconnect();
      };

      window.onbeforeunload = () => {
        this.WS.close();
        if (this.interval) {
          clearInterval(this.interval);
          this.interval = null;
        }
      };

      this.WS.onmessage = (ev) => {
        var recvmsg = JSON.parse(ev.data);

        this.log.info("RTCStream WS onmessage", recvmsg.type, recvmsg);

        switch (recvmsg.type) {
          case RTCStreamEventType.LOGIN:
            if (recvmsg.result && !this.regStatus) {
              this.regStatus = true;
            }

            if (!recvmsg.result) {
              this.WS.close();
            }
            this.notify({
              type: recvmsg.type,
              result: recvmsg.result,
              reason: recvmsg.reason === undefined ? "" : recvmsg.reason,
            });
            if (this.interval) {
              clearInterval(this.interval);
              this.interval = null;
            }
            recvmsg.result && this.heart();
            break;
          // case RTCStreamEventType.LOGOUT:
          //     // this.regStatus = false;
          //     // this.notify({"type":recvmsg.type, "result":recvmsg.result, "reason":recvmsg.reason===undefined?"":recvmsg.reason});
          //     break;
          case RTCStreamEventType.PTT_REQUEST:
          case RTCStreamEventType.PTT_RELEASE:
            this.notify({ type: recvmsg.type, result: recvmsg.result });
            break;
          case RTCStreamEventType.ON_PTT_REQUEST:
            this.notify({
              type: recvmsg.type,
              tel: recvmsg.content === undefined ? "" : recvmsg.content,
            });
            break;
          case RTCStreamEventType.ON_PTT_RELEASE:
            this.notify({ type: recvmsg.type });
            break;
          case RTCStreamEventType.ON_RING:
            this.ringbacktone.currentTime = 0;
            this.ringbacktone.muted = true;
            this.ringbacktone.play();
            this.notify({ type: recvmsg.type });
            break;
          case RTCStreamEventType.ON_RING_183:
            this.ringbacktone.pause();
            this.onanswer(recvmsg.sdp);
            this.notify({ type: recvmsg.type });
            break;
          case RTCStreamEventType.ON_ANSWER:
            this.ringbacktone.pause();
            this.onanswer(recvmsg.sdp);
            this.notify({ type: recvmsg.type });
            break;
          case RTCStreamEventType.ON_HANGUP:
            this.notify({
              type: recvmsg.type,
              reason: recvmsg.reason === undefined ? "" : recvmsg.reason,
            });
            this.closeCall();
            this.ringtone.pause();
            this.ringbacktone.pause();
            break;
          case RTCStreamEventType.ON_NEW_CALL:
            // 判断是否已存在通话
            for (let item of RTCStream.instances.values()) {
              if (item.callStatus) {
                return;
              }
            }

            this.setRemoteSdp = false;
            this.isHalf = recvmsg.ishalf;
            this.isVideo = recvmsg.isvideo;
            this.remoteSdp = recvmsg.sdp;
            this.callDirection = CALL_DIRECTION.IN;
            this.ring();
            this.callStatus = true;
            this.ringtone.currentTime = 0;
            try {
              var u = navigator.userAgent;
              var isAndroid =
                u.indexOf("Android") > -1 || u.indexOf("Adr") > -1; //android终端
              var isiOS = !!u.match(/\(i[^;]+;( U;)? CPU.+Mac OS X/); //ios终
              if (isAndroid) {
                this.ringtone.muted = true;
                this.ringtone.play();
              } else if (isiOS) {
                this.ringtone.muted = true;
                this.ringtone.play();
              } else if (!isAndroid && !isiOS) {
                this.ringtone.muted = true;
                this.ringtone.play();
              }
            } catch (error) {
              this.log.error("ringtone.play", error);
            }

            this.notify(recvmsg);
            break;
        }
      };

      this.WS.onerror = (ev) => {
        this.log.error("WS.onerror", this.WS.readyState, ev);
        this.reconnect();
      };
    }

    //重连
    reconnect() {
      try {
        this.closeCall();
      } catch (error) {}
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        //重新注册
        if (this.client._isLogin() && !this.rtcStream.loginFail) {
          this.client._initSoftPhone();
        }
      }, 1000);
    }

    notify(content) {
      if (this.onMessage != null) {
        this.onMessage(content);
      }
    }

    onanswer(sdp) {
      this.PC.setRemoteDescription(
        new RTCSessionDescription({
          type: "answer",
          sdp: sdp,
        })
      );
      this.setRemoteSdp = true;
      // }
    }

    onnewcall(sdp) {
      if (!this.setRemoteSdp) {
        this.PC.setRemoteDescription(
          new RTCSessionDescription({
            type: "offer",
            sdp: sdp,
          })
        );
        this.setRemoteSdp = true;
      }
    }

    heart() {
      if (this.regStatus) {
        this.interval && clearTimeout(this.interval);
        this.interval = setTimeout(() => {
          this.sendTo({ type: RTCStreamEventType.HEART, user_name: this.tel });
          this.heart();
        }, this.heartTimeout);
      }
    }

    login() {
      this.sendTo({
        type: RTCStreamEventType.LOGIN,
        user_name: this.tel,
        pass_word: this.passwd,
        user_agent: this.isSupportH264() ? "windows" : "other",
      });
    }

    isSupportMandatory() {
      var ua = navigator.userAgent.toLocaleLowerCase();
      return this.isSupportH264() && !/chrome\/\d{2}.\d+/.test(ua);
    }

    isSupportH264() {
      try {
        var ua = navigator.userAgent.toLocaleLowerCase();
        if (/android|adr/gi.test(ua) || /iPad/gi.test(ua)) return false;

        return /chrome\/\d+/.test(ua);
      } catch (error) {}

      return false;
    }

    logout() {
      this.regStatus = false;
      this.sendTo({ type: RTCStreamEventType.LOGOUT, user_name: this.tel });
    }

    dtmf(value) {
      if (!this.callStatus) {
        return false;
      }
      var dtmfAudio = new Audio("/static/sounds/dtmf.wav");
      dtmfAudio.muted = true;
      dtmfAudio.play();
      this.sendTo({ type: RTCStreamEventType.DTMF, content: value });
      return true;
    }

    pttrequest() {
      if (!this.callStatus) {
        return false;
      }
      this.sendTo({ type: RTCStreamEventType.PTT_REQUEST });
      return true;
    }

    pttrelease() {
      if (!this.callStatus) {
        return false;
      }
      this.sendTo({ type: RTCStreamEventType.PTT_RELEASE });
      return true;
    }

    exit() {
      try {
        this.ringtone.pause();
        this.ringbacktone.pause();
        this.PC && this.PC.close();
      } catch (error) {}
      if (this.regStatus) {
        this.logout();
      }
      this.regStatus = false;
      this.callStatus = false;
      this.WS.close();
    }

    call(called, localElement, remoteElement, isVideo, isHalf) {
      try {
        if (!this.regStatus) {
          this.log.info("user is not login");
          this.notify({
            type: RTCStreamEventType.MAKE_CALL,
            result: false,
            reason: "用户未登录",
          });
          return;
        }

        if (this.callStatus) {
          this.notify({
            type: RTCStreamEventType.MAKE_CALL,
            result: false,
            reason: "已经在呼叫中",
          });
          return;
        }

        // if (!checkSupportWebrtc()) {
        //   this.notify({
        //     type: RTCStreamEventType.MAKE_CALL,
        //     result: false,
        //     reason: '浏览器不支持WEBRTC',
        //   });
        //   return;
        // }

        this.localElement = localElement;
        this.remoteElement = remoteElement;
        this.isVideo = isVideo;
        this.isHalf = isHalf;
        this.callStatus = true;
        this.callDirection = CALL_DIRECTION.OUT;
        this.setRemoteSdp = false;

        if (this.isHalf) {
          this.isVideo = false;
        }

        this.PC = new RTCPeerConnection(this.config);

        this.PC.onnegotiationneeded = () => {
          this.PC.createOffer().then((offer) => {
            this.log.info("createOffer", offer);
            this.PC.setLocalDescription(offer);
          });
        };

        this.PC.onicecandidate = (iceevent) => {
          if (iceevent.candidate == null) {
            this.log.info("onicecandidate", this.PC.localDescription);
            this.sendTo({
              type: RTCStreamEventType.MAKE_CALL,
              from: this.tel,
              to: called,
              sdp: this.PC.localDescription.sdp,
              ishalf: this.isHalf,
              isvideo: this.isVideo,
            });
          }
        };

        this.PC.ontrack = (rtcTrackEvent) => {
          this.remoteElement.srcObject = rtcTrackEvent.streams[0];
          this.remoteElement.autoplay = true;
        };

        this.gotLocalMedia();
      } catch (e) {
        this.callStatus = false;
        this.notify({
          type: RTCStreamEventType.MAKE_CALL,
          result: false,
          reason: "" + e,
        });
      }
    }

    answer(localElement, remoteElement) {
      this.log.info("0-----answer-----", localElement?.id, remoteElement?.id);

      this.localElement = localElement;
      this.remoteElement = remoteElement;

      this.PC = new RTCPeerConnection(this.config);
      this.PC.onnegotiationneeded = () => {
        this.onnewcall(this.remoteSdp);

        this.PC.createAnswer().then((answer) => {
          this.PC.setLocalDescription(answer);
        });
      };

      this.PC.onicecandidate = (iceevent) => {
        if (iceevent.candidate == null) {
          this.sendTo({
            type: RTCStreamEventType.ANSWER,
            from: this.tel,
            sdp: this.PC.localDescription.sdp,
          });
        }
      };

      this.PC.ontrack = (rtcTrackEvent) => {
        if (this.remoteElement) {
          if (
            this.remoteElement.tagName === "VIDEO" &&
            rtcTrackEvent.track.kind === "audio"
          ) {
            return;
          }
          if (
            this.remoteElement.tagName === "AUDIO" &&
            rtcTrackEvent.track.kind === "video"
          ) {
            return;
          }
          this.remoteElement.srcObject = rtcTrackEvent.streams[0];

          this.remoteElement.play();
          this.remoteElement.muted = false;
        }
      };
      try {
        this.ringtone.pause();
      } catch (error) {}

      this.gotLocalMedia();
    }

    hangup() {
      this.sendTo({
        type: RTCStreamEventType.HANGUP,
        from: this.tel,
      });
      this.closeCall();
      this.ringtone.pause();
      this.ringbacktone.pause();
    }

    hangupWithReason(reason) {
      this.sendTo({
        type: RTCStreamEventType.HANGUP,
        from: this.tel,
        reason: reason,
      });
      this.closeCall();
    }

    ring() {
      this.sendTo({
        type: RTCStreamEventType.RING,
        from: this.tel,
      });
    }

    sendTo(msg) {
      if (this.WSStatus) {
        this.WS.send(JSON.stringify(msg));
      } else {
        this.log.info("wsstatus error, wsstatus: ", this.WSStatus);
      }
    }
    gotLocalMedia() {
      var config = {};

      if (this.isVideo) {
        config = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            deviceId: this.rtcStream.microphoneId || RTCStream.audioInput,
          },
          // video: { width: { exact: 1280 }, height: { exact: 720 }, advanced: [{ facingMode: { exact: 'user' } }] }
          // video: {
          //   mandatory: { width: 1280, height: 720, facingMode: { exact: 'user' } },
          //   // width: { exact: 1280 },
          //   // height: { exact: 720 },
        };
        if (this.isSupportMandatory()) {
          config.video = {
            mandatory: {
              width: 1280,
              maxWidth: 1280,
              minWidth: 1280,
              maxHeight: 720,
              minHeight: 720,
              height: 720,
              facingMode: { exact: "user" },
            },
          };
          if (this.rtcStream.cameraId || RTCStream.videoInput) {
            config.video.mandatory.deviceId =
              this.rtcStream.cameraId || RTCStream.videoInput;
          }
        } else {
          config.video = {
            advanced: [
              { facingMode: { exact: "user" }, height: 720, width: 1280 },
            ],
          };
          if (this.rtcStream.cameraId || RTCStream.videoInput) {
            config.video.advanced.deviceId =
              this.rtcStream.cameraId || RTCStream.videoInput;
          }
        }
      } else {
        config = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            deviceId: this.rtcStream.microphoneId || RTCStream.audioInput,
          },
          video: false,
        };
      }
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia(config)
          .then((stream) => {
            this.getMediaSucc(stream);
          })
          .catch((error) => {
            this.getMediaFail(error);
          });
      } else if (navigator.webkitGetUserMedia) {
        navigator.webkitGetUserMedia(
          config,
          (stream) => {
            this.getMediaSucc(stream);
          },
          (error) => {
            this.getMediaFail(error);
          }
        );
      } else if (navigator.mozGetUserMedia) {
        navigator.mozGetUserMedia(
          config,
          (stream) => {
            this.getMediaSucc(stream);
          },
          (error) => {
            this.getMediaFail(error);
          }
        );
      } else {
        if (this.callDirection === CALL_DIRECTION.OUT) {
          this.notify({
            type: RTCStreamEventType.MAKE_CALL,
            result: false,
            reason: "浏览器不支持WEBRTC",
          });
          this.closeCall();
        } else {
          this.notify({
            type: RTCStreamEventType.ANSWER,
            result: false,
            reason: "浏览器不支持WEBRTC",
          });
          this.hangupWithReason("can't get getUserMedia function");
          this.closeCall();
        }
      }
    }

    getMediaSucc(stream) {
      this.localStream = stream;
      if (this.isVideo && this.localElement != null) {
        this.localElement.srcObject = stream;
        this.localElement.play();
        this.localElement.muted = true;
      }

      stream.getTracks().forEach((track) => {
        if (this.PC) this.PC.addTrack(track, stream);
      });

      if (!this.isSupportH264()) return;

      try {
        const supportsSetCodecPreferences =
          window.RTCRtpTransceiver &&
          "setCodecPreferences" in window.RTCRtpTransceiver.prototype;
        if (supportsSetCodecPreferences) {
          const { codecs } = RTCRtpSender.getCapabilities("video");
          const selectedCodecIndex = codecs.findIndex(
            (c) =>
              c.mimeType === "video/H264" &&
              c.sdpFmtpLine.includes("packetization-mode=1") &&
              c.sdpFmtpLine.includes("profile-level-id=42e01f")
          );
          const selectedCodec = codecs[selectedCodecIndex];
          codecs.splice(selectedCodecIndex, 1);
          codecs.unshift(selectedCodec);
          this.log.info("支持的编码", codecs);
          const transceiver = this.PC.getTransceivers().find(
            (t) => t.sender && t.sender.track === stream.getVideoTracks()[0]
          );
          if (transceiver) {
            transceiver.setCodecPreferences(codecs);
            this.log.info("选择的编码", selectedCodec);
          } else {
            this.log.info("PC.transceiver不存在");
          }
        } else {
          this.log.info("浏览器Webrtc不支持设置视频编码");
        }
      } catch (error) {
        this.log.info("不支持设置编码 err", error);
      }
    }

    getMediaFail(error) {
      this.log.info("getMediaFail error", error);
      if (this.callDirection === CALL_DIRECTION.OUT) {
        this.notify({
          type: RTCStreamEventType.MAKE_CALL,
          result: false,
          reason: "获取媒体资源失败",
        });
        this.closeCall();
      } else {
        this.notify({
          type: RTCStreamEventType.ANSWER,
          result: false,
          reason: "获取媒体资源失败",
        });
        this.hangupWithReason("getUserMedia function");
        this.closeCall();
      }
    }

    closeCall() {
      if (this.PC != null) {
        this.PC.close();
        this.PC = null;
        this.localElement = null;
        this.remoteElement = null;
        this.isVideo = false;
      }

      if (this.localStream != null) {
        this.localStream.getTracks().forEach((track) => {
          this.localStream.removeTrack(track);
          track.stop();
        });
        this.localStream = null;
      }

      this.callStatus = false;
    }

    muted(isMuted = true) {
      this.localStream.getTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }
  };

  /**
   * RTSPStream事件集合
   *
   */
  const RTSPStreamEventType = {
    /**
     * ALL表示订阅所有事件，只是用来派发事件，实际上不存在该事件
     */
    ALL: "All",
    FAILED: "failed", //播放失败
    PLAYING: "playing", //正在开始播放
    OPEN: "open", //播放成功
    CLOSE: "close", //播放关闭
  };

  /**
   * rtsp播放控制类
   */
  class RTSPStream {
    static LOG = Logger.prefix("RTSPStream");

    constructor(options = {}) {
      this.options = options;
      this.client = options.client;
      this.Server = options.server + "/rtspplay"; // 服务器
      this.RtspUrl = options.rtspUrl;
      this.callback = options.callback;
      this.RemoteVideo =
        options.remoteVideo instanceof HTMLElement
          ? options.remoteVideo
          : document.getElementById(options.remoteVideo);
      this.isPlaying = false;
      this.SendChannel = null;
      this.temp = options.temp || {};
      this.PC = new RTCPeerConnection();
      this.Interval = null;
      this.Offer = null;
      this.PC.onnegotiationneeded = (e) => this.handleNegotiationNeededEvent(e);
      this.PC.onicecandidate = (e) => this.onicecandidateEvent(e);
      this.PC.ontrack = (e) => this.ontrackEvent(e);

      //录音
      this.mediaRecorder = null;
      this.recordedBlobs = [];

      /**
       * 事件
       */
      this.eventMap = {}; //事件集合
      this.onceEventMap = {}; // 单次事件集合，只执行一次
      this.event = new Proxy(
        {},
        {
          set: (target, property, fn) => {
            this.eventMap[property] || (this.eventMap[property] = []);
            //同一个事件和同一个回调函数不再添加
            !this.eventMap[property].some((f) => f == fn) &&
              this.eventMap[property].push(fn);
            return true;
          },
        }
      );
      this.onceEvent = new Proxy(
        {},
        {
          set: (target, property, fn) => {
            this.onceEventMap[property] || (this.onceEventMap[property] = []);
            //同一个事件和同一个回调函数不再添加
            !this.onceEventMap[property].some((f) => f == fn) &&
              this.onceEventMap[property].push(fn);
            return true;
          },
        }
      );
    }

    /**
     * 序列化
     */
    toJSON() {
      return JSON.stringify({
        Server: this.Server,
        RtspUrl: this.RtspUrl,
        isPlaying: this.isPlaying,
        temp: this.temp,
        options: this.options,
      });
    }

    /**
     * 播放
     */
    play() {
      const self = this;
      RTSPStream.LOG.info("RTSPStream play rtspUrl", this.RtspUrl);

      let formData = new FormData();
      formData.append("url", btoa(self.RtspUrl));

      return new Promise((resolve, reject) => {
        axios
          .post(`${self.Server}/play`, formData, {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          })
          .then((res) => {
            if (res.data.result !== "succ") {
              this.isPlaying = false;
              RTSPStream.LOG.error(
                "rtspPlay播放失败",
                res.reason,
                self.RtspUrl
              );
              reject(R.err(ErrCode.RTSP_PLAY_FAILED, res.reason, res.data));

              this.emit(RTSPStreamEventType.FAILED, {
                event: RTSPStreamEventType.FAILED,
                reason: res.reason,
                data: res.data,
                elementId: self.RemoteVideo.id,
                rtspStrean: self,
              });
            }

            resolve(res.data);

            this.emit(RTSPStreamEventType.PLAYING, {
              event: RTSPStreamEventType.PLAYING,
              reason: res.reason,
              data: res.data,
              elementId: self.RemoteVideo.id,
              rtspStrean: self,
            });

            self.PC.addTransceiver("video", {
              direction: "sendrecv",
            });

            self.SendChannel = self.PC.createDataChannel("foo");
            self.SendChannel.onclose = (event) => {
              RTSPStream.LOG.info("sendChannel has closed");
              self.stop();
              if (self.callback)
                self.callback(
                  { event: "close", elementId: self.RemoteVideo.id },
                  self
                );

              this.emit(RTSPStreamEventType.CLOSE, {
                event: RTSPStreamEventType.CLOSE,
                reason: "SendChannel has closed",
                elementId: self.RemoteVideo.id,
                rtspStrean: self,
              });
            };
            self.SendChannel.onopen = (event) => {
              self.isPlaying = true;
              RTSPStream.LOG.info(
                "打开摄像头成功",
                self.RemoteVideo.id,
                event.type
              );
              if (self.callback)
                self.callback(
                  { event: "open", elementId: self.RemoteVideo.id },
                  self
                );

              this.emit(RTSPStreamEventType.OPEN, {
                event: RTSPStreamEventType.OPEN,
                elementId: self.RemoteVideo.id,
                rtspStrean: self,
              });

              RTSPStream.LOG.info("sendChannel has opened");
              self.SendChannel.send("Keep-Alive");
              self.Interval = setInterval(function () {
                self.SendChannel.send("Keep-Alive");
              }, 3000);
            };
            self.SendChannel.onmessage = (event) => {
              RTSPStream.LOG.info(
                "Message from DataChannel: payload " + event.data
              );
            };
          })
          .catch((err) => {
            this.isPlaying = false;
            RTSPStream.LOG.error("rtspPlay播放失败", err);
            reject(R.err(ErrCode.RTSP_PLAY_FAILED, "", err));

            this.emit(RTSPStreamEventType.FAILED, {
              event: RTSPStreamEventType.FAILED,
              reason: "play err",
              elementId: self.RemoteVideo.id,
              rtspStrean: self,
            });
          });
      });
    }

    /**
     * 关闭
     */
    stop() {
      try {
        this.Interval && clearInterval(this.Interval);
        this.PC.close();
      } catch (error) {}

      this.isPlaying = false;

      return R.resolve();
    }

    /**
     * 是否正在播放
     */
    isPlaying() {
      return this.isPlaying;
    }

    /**
     * 截图
     */
    takeSnapshot() {
      if (!this.RemoteVideo) return R.toReject(ErrCode.RTSP_NOT_PLAY);

      let canvas = document.createElement("canvas");

      canvas.width = this.RemoteVideo.videoWidth;
      canvas.height = this.RemoteVideo.videoHeight;
      canvas
        .getContext("2d")
        .drawImage(this.RemoteVideo, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/png");

      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `${new Date()
        .toLocaleDateString()
        .replaceAll("/", "-")}-${new Date()
        .toLocaleTimeString()
        .replaceAll(":", "-")}-screenshot.png`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);

      return R.resolve();
    }

    /**
     * 开始本地录像
     */
    startMediaRecording() {
      if (!this.isPlaying) return R.toReject(ErrCode.RTSP_NOT_PLAY);

      const stream = this.RemoteVideo.captureStream();

      const options = { mimeType: getSupportedMimeType() };
      try {
        const mediaRecorder = (this.mediaRecorder = new MediaRecorder(
          stream,
          options
        ));
        mediaRecorder.onstop = (event) => {
          RTCStream.LOG.info("Recorder stopped: ", event);
        };
        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            this.recordedBlobs.push(event.data);
          }
        };
        this.recordedBlobs = [];
        mediaRecorder.start();
        RTCStream.LOG.info("MediaRecorder started", mediaRecorder);
      } catch (e) {
        RTCStream.LOG.error("Exception while creating MediaRecorder:", e);
        return R.toReject(ErrCode.MEDIA_RECORDER_CREATE_FAILED);
      }
      return R.resolve();
    }

    /**
     * 停止本地录像
     */
    stopMediaRecording() {
      if (this.mediaRecorder) {
        this.mediaRecorder.stop();

        if (this.mediaRecorder.length > 0) {
          const mimeType = getSupportedMimeType().split(";", 1)[0];
          const blob = new Blob(this.recordedBlobs, { type: mimeType });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.style.display = "none";
          a.href = url;
          a.download = "test.webm";
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          }, 100);

          this.mediaRecorder = null;
          this.recordedBlobs = [];
        }
      }

      return R.resolve();
    }

    /**
     * 绑定事件
     * @param {String} name 事件名称
     * @param {Function} fn 回调函数
     */
    on(name, fn) {
      if (name && typeof fn === "function") {
        let onFns = this.eventMap[name];
        if (!onFns || !onFns.some((f) => f == fn)) {
          this.event[name] = fn;
        }
      }
      return this;
    }

    /**
     * 移除事件
     * @param {String} name 事件名称
     * @param {Function} fn 存在则移除与该回调函数相关的事件
     */
    off(name, fn) {
      if (name) {
        if (fn) {
          let funs = this.eventMap[name];
          let index;
          if (funs && (index = funs.findIndex((f) => f == fn)) != -1) {
            funs.splice(index, 1);
          }
        } else {
          delete this.eventMap[name];
          delete this.onceEventMap[name];
        }
      }
      return this;
    }

    /**
     * 派发事件，即回调, 所有事件都会派发到client订阅的所有事件
     * @param {String} name 事件名
     * @param  {...any} val 消息
     */
    emit(name, val) {
      try {
        this.eventMap[name] &&
          this.eventMap[name].forEach((fn) => {
            fn(val, this);
          });
        //派发给客户端ALL事件
        this.client?.eventMap[EventType.ALL] &&
          this.client.eventMap[EventType.ALL].forEach((fn) => {
            fn({
              eventType: EventType.RTC_STREAM_SESSION_EVENT,
              data: { event: val, rtcStream: this },
            });
          });
      } catch (error) {
        RTSPStream.LOG.error("派发事件失败", error);
      }
    }

    async handleNegotiationNeededEvent() {
      this.Offer = await this.PC.createOffer();
      await this.PC.setLocalDescription(this.Offer);
    }

    onicecandidateEvent(e) {
      const self = this;
      if (e.candidate == null) {
        let formData = new FormData();
        formData.append("url", btoa(self.RtspUrl));
        formData.append("data", btoa(self.PC.localDescription.sdp));
        axios
          .post(`${self.Server}/recive`, formData, {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          })
          .then((res) => {
            RTCStream.LOG.info(
              "recv receive response",
              JSON.stringify(res.data)
            );
            if (res.data.result !== "succ") {
              if (self.callback) {
                self.callback(
                  {
                    status: "fail",
                    reason: res.data.reason,
                    elementId: self.RemoteVideo.id,
                  },
                  self
                );
              }
              self.stop();
              RTCStream.LOG.info(
                "onicecandidateEvent 播放失败",
                res.data.reason
              );
              return;
            }
            try {
              self.PC.setRemoteDescription(
                new RTCSessionDescription({
                  type: "answer",
                  sdp: atob(res.data.data),
                })
              );
            } catch (err) {
              RTCStream.LOG.info(self.RtspUrl, err);
            }
          })
          .catch((err) => {
            RTCStream.LOG.info("onicecandidateEvent 播放失败", err);
            self.callback(
              {
                status: "fail",
                reason: err,
                elementId: self.RemoteVideo.id,
              },
              self
            );
            self.stop();
          });
      }
    }

    ontrackEvent(e) {
      this.RemoteVideo.srcObject = e.streams[0];
      this.RemoteVideo.muted = true;
      this.RemoteVideo.autoplay = true;
    }
  }

  /**
   * 录音支持的格式
   * @returns
   */
  const getSupportedMimeType = () => {
    const possibleTypes = [
      "video/mp4;codecs=h264,aac",
      "video/webm;codecs=h264,opus",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
    ];
    return possibleTypes.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType)
    );
  };

  /**
   * 呼叫控制类
   */
  class CallSessions {
    static LOG = Logger.prefix("CallSessions");

    constructor(client) {
      this.client = client;
      this.log = CallSessions.LOG;
    }

    /**
     * 获取调度通话记录
     */
    getCdrList(data) {
      return Api.CallSessions.getCdrList(data);
    }

    /**
     * 单呼
     * @param {String} calledDevice 被叫号码
     * @param {String} callType 呼叫类型, 默认语音 @see CallType
     * @param {String} duplexMode 双工模式，默认全双工 @see DuplexMode
     * @param {String} userID 被叫用户ID,可选
     * @returns
     */
    makeCall({
      calledDevice,
      callType = CallType.AUDIO,
      duplexMode = DuplexMode.FULL,
      userID,
    } = {}) {
      if (Util.isEmpty(calledDevice))
        return Promise.reject(R.err("被叫号码不能为空"));
      let callingDevice = this._getAvailableTel(
        false,
        duplexMode === DuplexMode.HALF
      );
      if (!callingDevice)
        return Promise.reject(R.err("手柄离线或不可用，请检查。", 6001));
      return Api.CallSessions.makeCall({
        callingDevice,
        calledDevice,
        callType,
        duplexMode,
        userID,
      });
    }

    /**
     * 挂断
     * @returns
     */
    clearCall() {
      return Api.CallSessions.clearCall();
    }

    /**
     * 拆线
     * @param {String} calledDevice 被拆号码
     * @param {String} userID 被叫用户ID
     */
    clearConnection({ calledDevice, userID } = {}) {
      if (Util.isEmpty(calledDevice))
        return Promise.reject(R.err("被拆号码不能为空"));
      return Api.CallSessions.clearConnection({ calledDevice, userID });
    }

    /**
     * 呼叫保持
     * @param {Object} calledDevice
     * @param {String} userID
     * @returns
     */
    holdCall({ calledDevice, userID } = {}) {
      if (Util.isEmpty(calledDevice))
        return Promise.reject(R.err("用户号码不能为空"));
      return Api.CallSessions.holdCall({
        calledDevice,
        userID,
      });
    }

    /**
     * 解除呼叫保持
     * @param {Object} calledDevice
     * @param {String} userID
     * @param {String} callType
     * @returns
     */
    unholdCall({ calledDevice, userID, callType = CallType.AUDIO } = {}) {
      if (Util.isEmpty(calledDevice))
        return Promise.reject(R.err("解除保持用户号码不能为空"));
      let callingDevice = this._getAvailableTel();
      if (!callingDevice)
        return Promise.reject(R.err("手柄离线或不可用，请检查", 6001));
      return Api.CallSessions.unholdCall({
        callingDevice,
        calledDevice,
        userID,
        callType,
      });
    }

    /**
     * 应答
     * @param {String} calledDevice
     * @param {String} userID
     */
    answerCall({ calledDevice, userID } = {}) {
      if (Util.isEmpty(calledDevice))
        return Promise.reject(R.err("被应答的号码不能为空"));
      let callingDevice = this._getAvailableTel();
      if (!callingDevice)
        return Promise.reject(R.err("手柄离线或不可用，请检查", 6001));
      return Api.CallSessions.answerCall({
        callingDevice,
        calledDevice,
        userID,
      });
    }

    /**
     * 群答
     * @param {Object} called
     * @param {String} callMode
     * @param {String} meetID
     * @returns
     */
    groupAnswerCall({ meetID, isSpeak = YesOrNo.NO } = {}) {
      let callingDevice = meetID
        ? this.client.conferenceRoom.meetingCalling.get(meetID) ||
          this._getAvailableTel(true)
        : this._getAvailableTel(true);
      if (!callingDevice)
        return Promise.reject(R.err("手柄离线或不可用，请检查", 6001));
      if (meetID) {
        this.client.conferenceRoom.meetingCalling.set(meetID, callingDevice);
        return Api.CallSessions.groupAnswerCall({
          callingDevice,
          isSpeak,
          meetID,
        });
      }
      //会议ID不存在
      let meet = this.client.conferenceRoom.systemMeetList.find(
        (m) => m.meetMode === MeetMode.AUDIO
      );
      if (meet) {
        meetID = meet.meetID;
        this.client.conferenceRoom.meetingCalling.set(meetID, callingDevice);
        return Api.CallSessions.groupAnswerCall({
          callingDevice,
          isSpeak,
          meetID,
        });
      } else {
        return new Promise((resolve, reject) => {
          this.client.conferenceRoom
            .listMeet((res) => {
              meet = res.data.list.find(
                (m) =>
                  m.meetMode === MeetMode.AUDIO && m.isSystem === YesOrNo.YES
              );
              if (meet) {
                meetID = meet.meetID;
                this.client.conferenceRoom.meetingCalling.set(
                  meetID,
                  callingDevice
                );
                Api.CallSessions.groupAnswerCall({
                  callingDevice,
                  isSpeak,
                  meetID,
                })
                  .then((res) => {
                    resolve(res);
                  })
                  .catch((err) => {
                    reject(err);
                  });
              } else reject(R.err("没有会议资源"));
            })
            .catch((err) => {
              reject(R.err("没有会议资源"));
            });
        });
      }
    }

    /**
     * 通话录音
     * @param {String} isRecord 是否录音
     * @param {String} activeDevice 录音的用户号码
     * @param {String} activeUserID 录音的用户id
     * @returns
     */
    recordCall({ isRecord = YesOrNo.YES, activeDevice, activeUserID } = {}) {
      if (Util.isEmpty(activeDevice))
        return Promise.reject(R.err("录音的用户号码不能为空"));
      return Api.CallSessions.recordCall({
        isRecord,
        activeDevice,
        activeUserID,
      });
    }

    /**
     * 加入会议
     * @param {String} calledDevice 被叫号码
     * @param {String} userID 被叫用户ID,可选
     * @param {String} meetID 会议ID,可选
     * @param {String} meetMode 会议模式
     * @returns
     */
    joinMeetCall({
      callingDevice,
      calledDevice,
      userID,
      meetID,
      meetMode = MeetMode.AUDIO,
    } = {}) {
      if (Util.isEmpty(calledDevice))
        return Promise.reject(R.err("被叫号码不能为空"));
      callingDevice ??= meetID
        ? this.client.conferenceRoom.meetingCalling.get(meetID) ||
          this._getAvailableTel(true)
        : this._getAvailableTel(true);
      if (!callingDevice)
        return Promise.reject(R.err("手柄离线或不可用，请检查", 6001));
      return new Promise(async (resolve, reject) => {
        //会议ID不存在
        if (!meetID) {
          if (
            !this.client.conferenceRoom.systemMeetList ||
            !this.client.conferenceRoom.systemMeetList.length
          ) {
            await this.client.conferenceRoom
              .listMeet((res) => {
                let meet = res.data.list.find(
                  (m) => m.meetMode === meetMode && m.isSystem === YesOrNo.YES
                );
                if (!meet) {
                  meet = res.data.list.find(
                    (m) =>
                      m.meetMode === MeetMode.AUDIO &&
                      m.isSystem === YesOrNo.YES
                  );
                }
                if (meet) {
                  meetID = meet.meetID;
                }
              })
              .catch((err) => {
                reject(R.err("没有会议资源"));
              });
          } else {
            let meet = this.client.conferenceRoom.systemMeetList.find(
              (m) => m.meetMode === meetMode
            );
            if (meet) meetID = meet.meetID;
          }
        }

        if (meetID) {
          this.client.conferenceRoom.meetingCalling.set(meetID, callingDevice);
          Api.CallSessions.joinMeetCall({
            callingDevice,
            calledDevice,
            meetID,
            userID,
          })
            .then((res) => {
              return resolve(
                R.ok({
                  callingDevice,
                  calledDevice,
                  meetID,
                  userID,
                  callSessionID: res.data.callSessionID,
                })
              );
            })
            .catch((err) => {
              reject(err);
            });
        } else reject(R.err("没有会议资源"));
      });
    }

    /**
     * 强呼
     * @param {Array} calledDevice 被叫号码
     * @param {String} callType 呼叫类型, 默认语音 @see CallType
     * @param {String} callMode 模式，parallel @see CallMode
     * @param {String} userID 被叫用户ID,可选
     * @returns
     */
    advanceCall({
      calledDevice,
      callType = CallType.AUDIO,
      callMode = CallMode.PARALLEL,
      userID,
    } = {}) {
      if (Util.isEmpty(calledDevice))
        return Promise.reject(R.err("被叫号码不能为空"));
      let callingDevice = this._getAvailableTel(false);
      if (!callingDevice)
        return Promise.reject(R.err("手柄离线或不可用，请检查。", 6001));
      return Api.CallSessions.advanceCall({
        callingDevice,
        calledDevice,
        callType,
        callMode,
        userID,
      });
    }

    /**
     * 组呼
     * @param {String} groupID 组ID
     * @param {String} meetID
     * @param {String} callMode
     * @param {String} meetMode
     * @returns
     */
    groupCall({
      groupID,
      meetID,
      callMode = CallMode.PARALLEL,
      meetMode = MeetMode.AUDIO,
    } = {}) {
      if (Util.isEmpty(groupID)) return Promise.reject(R.err("组ID不能为空"));
      let callingDevice = meetID
        ? this.client.conferenceRoom.meetingCalling.get(meetID) ||
          this._getAvailableTel(true)
        : this._getAvailableTel(true);
      if (!callingDevice)
        return Promise.reject(R.err("手柄离线或不可用，请检查", 6001));
      if (meetID) {
        this.client.conferenceRoom.meetingCalling.set(meetID, callingDevice);
        return new Promise((resolve, reject) => {
          Api.CallSessions.groupCall({
            callingDevice,
            groupID,
            callMode,
            meetID,
          })
            .then((res) => {
              resolve(
                R.ok({
                  callSessionID: res.data.callSessionID,
                  callingDevice,
                  groupID,
                  callMode,
                  meetID,
                })
              );
            })
            .catch((err) => {
              reject(err);
            });
        });
      }
      //会议ID不存在
      let meet = this.client.conferenceRoom.systemMeetList.find(
        (m) => m.meetMode === meetMode
      );
      if (meet) {
        meetID = meet.meetID;
        this.client.conferenceRoom.meetingCalling.set(meetID, callingDevice);
        return new Promise((resolve, reject) => {
          Api.CallSessions.groupCall({
            callingDevice,
            groupID,
            callMode,
            meetID,
          })
            .then((res) => {
              resolve(
                R.ok({
                  callSessionID: res.data.callSessionID,
                  callingDevice,
                  groupID,
                  callMode,
                  meetID,
                })
              );
            })
            .catch((err) => {
              reject(err);
            });
        });
      } else {
        return new Promise((resolve, reject) => {
          this.client.conferenceRoom
            .listMeet((res) => {
              meet = res.data.list.find(
                (m) => m.meetMode === meetMode && m.isSystem === YesOrNo.YES
              );
              if (meet) {
                meetID = meet.meetID;
                this.client.conferenceRoom.meetingCalling.set(
                  meetID,
                  callingDevice
                );
                Api.CallSessions.groupCall({
                  callingDevice,
                  groupID,
                  callMode,
                  meetID,
                })
                  .then((res) => {
                    resolve(
                      R.ok({
                        callSessionID: res.data.callSessionID,
                        callingDevice,
                        groupID,
                        callMode,
                        meetID,
                      })
                    );
                  })
                  .catch((err) => {
                    reject(err);
                  });
              } else reject(R.err("没有会议资源"));
            })
            .catch((err) => {
              reject(R.err("没有会议资源"));
            });
        });
      }
    }

    /**
     * 结束组呼
     * @param {String} callSessionID
     * @returns
     */
    endGroupCall({ callSessionID } = {}) {
      if (Util.isEmpty(callSessionID))
        return Promise.reject(R.err("呼叫ID不能为空"));
      return Api.CallSessions.endGroupCall({ callSessionID });
    }

    /**
     * 选呼
     * @param {Object} called
     * @param {String} callMode
     * @param {String} meetID
     * @returns
     */
    selectCall({
      called,
      meetID,
      callMode = CallMode.PARALLEL,
      meetMode = MeetMode.AUDIO,
    } = {}) {
      // 被叫为空，呼叫自己
      // if (Util.isEmpty(called)) return Promise.reject(R.err('被叫用户不能为空'));

      let callingDevice = meetID
        ? this.client.conferenceRoom.meetingCalling.get(meetID) ||
          this._getAvailableTel(true)
        : this._getAvailableTel(true);
      if (!callingDevice)
        return Promise.reject(R.err("手柄离线或不可用，请检查", 6001));

      const tempCallingDevice = callingDevice;

      if (!called) {
        called = [
          {
            calledDevice: callingDevice,
            userID: this.client.operatorInfo.operatorID,
          },
        ];
        callingDevice = undefined;
      }

      if (meetID) {
        this.client.conferenceRoom.meetingCalling.set(
          meetID,
          tempCallingDevice
        );
        return Api.CallSessions.selectCall({
          callingDevice,
          called,
          callMode,
          meetID,
        });
      }
      //会议ID不存在
      let meet = this.client.conferenceRoom.systemMeetList.find(
        (m) => m.meetMode === meetMode
      );
      if (meet) {
        meetID = meet.meetID;
        this.client.conferenceRoom.meetingCalling.set(
          meetID,
          tempCallingDevice
        );
        return Api.CallSessions.selectCall({
          callingDevice,
          called,
          callMode,
          meetID,
        });
      } else {
        return new Promise((resolve, reject) => {
          this.client.conferenceRoom
            .listMeet((res) => {
              meet = res.data.list.find(
                (m) => m.meetMode === meetMode && m.isSystem === YesOrNo.YES
              );
              if (meet) {
                meetID = meet.meetID;
                this.client.conferenceRoom.meetingCalling.set(
                  meetID,
                  tempCallingDevice
                );
                Api.CallSessions.selectCall({
                  callingDevice,
                  called,
                  callMode,
                  meetID,
                })
                  .then((res) => {
                    resolve(res);
                  })
                  .catch((err) => {
                    reject(err);
                  });
              } else reject(R.err("没有会议资源"));
            })
            .catch((err) => {
              reject(R.err("没有会议资源"));
            });
        });
      }
    }

    /**
     * 结束选呼
     * @param {String} callSessionID
     * @returns
     */
    endSelectCall({ callSessionID } = {}) {
      if (Util.isEmpty(callSessionID))
        return Promise.reject(R.err("呼叫ID不能为空"));
      return Api.CallSessions.endSelectCall({ callSessionID });
    }

    /**
     * 点名
     * @param {Object} called
     * @param {String} callMode
     * @param {String} fileName
     * @returns
     */
    rollCall({ called, callMode = CallMode.PARALLEL, fileName } = {}) {
      if (Util.isEmpty(called))
        return Promise.reject(R.err("被叫用户不能为空"));
      let callingDevice = this._getAvailableTel();
      if (!callingDevice)
        return Promise.reject(R.err("手柄离线或不可用，请检查", 6001));
      return Api.CallSessions.rollCall({
        callingDevice,
        called,
        callMode,
        fileName,
      });
    }

    /**
     * 结束点名
     * @param {String} callSessionID
     * @returns
     */
    endRollCall({ callSessionID } = {}) {
      if (Util.isEmpty(callSessionID))
        return Promise.reject(R.err("呼叫ID不能为空"));
      return Api.CallSessions.endRollCall({ callSessionID });
    }

    /**
     * 轮询
     * @param {Object} called
     * @param {String} callType
     * @returns
     */
    pollCall({ called, callType = CallType.AUDIO } = {}) {
      if (Util.isEmpty(called))
        return Promise.reject(R.err("被叫用户不能为空"));
      let callingDevice = this._getAvailableTel();
      if (!callingDevice)
        return Promise.reject(R.err("手柄离线或不可用，请检查", 6001));
      return Api.CallSessions.pollCall({
        callingDevice,
        called,
        callType,
      });
    }

    /**
     * 结束轮询
     * @param {String} callSessionID
     * @returns
     */
    endPollCall({ callSessionID } = {}) {
      if (Util.isEmpty(callSessionID))
        return Promise.reject(R.err("呼叫ID不能为空"));
      return Api.CallSessions.endPollCall({ callSessionID });
    }

    /**
     * 广播
     * @param {Object} called
     * @param {String} callMode
     * @param {String} meetID
     * @returns
     */
    broadcastCall({
      called,
      callMode = BroadcastMode.MANUAL,
      callLoop = 0,
      fileName,
      callSessionID,
    } = {}) {
      if (Util.isEmpty(called))
        return Promise.reject(R.err("被叫用户不能为空"));
      let callingDevice = this._getAvailableTel();
      if (!callingDevice)
        return Promise.reject(R.err("手柄离线或不可用，请检查", 6001));
      if (callMode === BroadcastMode.FILE && !fileName) {
        return Promise.reject(R.err("文件广播文件名不能为空"));
      }
      if (callMode === BroadcastMode.TTS && !fileName) {
        return Promise.reject(R.err("文本文字内容不能为空"));
      }
      let data = {
        callingDevice,
        called,
        callMode,
        callLoop,
        fileName,
        callSessionID,
      };
      return new Promise((resolve, reject) => {
        Api.CallSessions.broadcastCall(data)
          .then((res) => {
            res.data = Object.assign(data, res.data);
            resolve(res);
          })
          .catch((err) => reject(err));
      });
    }

    /**
     * 结束广播
     * @param {String} callSessionID
     * @returns
     */
    endBroadcastCall({ callSessionID } = {}) {
      if (Util.isEmpty(callSessionID))
        return Promise.reject(R.err("呼叫ID不能为空"));
      return Api.CallSessions.endBroadcastCall({ callSessionID });
    }

    /**
     * 设置定时广播
     * @param {string} taskID 定时任务编号 修改时使用
     * @param {Object []} called 被叫用户列表 {calledDevice: 被叫用户号码, userID: 被叫用户id}
     * @param {string} callMode 定时模式 once按日期/looping重复
     * @param {string} fileName 语音文件
     * @param {string} callLoop 广播追呼，-1：循环，0：不追呼，大于0：追呼次数
     * @param {string} date 日期
     * @param {string} time 时间，（120100表示12:01:00）
     * @returns
     */
    setTimingBroadcast({
      taskID,
      called,
      callMode,
      fileName,
      callLoop,
      date,
      time,
    } = {}) {
      if (Util.hasEmpty(called, callMode, fileName, callLoop, date, time))
        return Promise.reject("参数校验失败");
      return Util.isEmpty(taskID)
        ? Api.CallSessions.addTimingBroadcast({
            called,
            callMode,
            fileName,
            callLoop,
            date,
            time,
          })
        : Api.CallSessions.editTimingBroadcast({
            taskID,
            called,
            callMode,
            fileName,
            callLoop,
            date,
            time,
          });
    }

    /**
     * 获取定时广播列表
     * @param {Integer} beginIndex 开始索引
     * @param {Integer} count 数量
     */
    getTimingBroadcast({ beginIndex, count } = {}) {
      return Api.CallSessions.listTimingBroadcast({ beginIndex, count });
    }

    /**
     * 删除定时广播
     * @param {string} taskID 定时任务编号
     */
    delTimingBroadcast({ taskID } = {}) {
      if (Util.isEmpty(taskID)) return Promise.reject("定时任务编号不能为空");
      return Api.CallSessions.delTimingBroadcast({ taskID });
    }

    /**
     * 呼叫转移
     * @param {Object} activeDevice 被转移的用户号码
     * @param {Object} calledDevice 转移至用户号码
     * @param {String} userID 转移至用户id
     * @returns
     */
    singleTransferCall({ activeDevice, calledDevice, userID } = {}) {
      if (Util.isEmpty(activeDevice))
        return Promise.reject(R.err("被转移用户号码不能为空"));
      if (Util.isEmpty(calledDevice))
        return Promise.reject(R.err("转移至用户号码不能为空"));
      return Api.CallSessions.singleTransferCall({
        activeDevice,
        calledDevice,
        userID,
      });
    }

    /**
     * 咨询呼叫
     * @param {String} callingDevice 主叫用户号码
     * @param {String} activeDevice 被转接的用户号码
     * @param {String} heldUserID 被转接的用户ID
     * @param {String} calledDevice 咨询的用户号码
     * @param {String} userID 咨询的用户id
     * @returns
     */
    consultCall({
      callingDevice,
      activeDevice,
      calledDevice,
      callType = "audio",
      userID,
    } = {}) {
      if (Util.isEmpty(activeDevice))
        return Promise.reject(R.err("被转接用户号码不能为空"));
      if (Util.isEmpty(calledDevice))
        return Promise.reject(R.err("咨询的用户号码不能为空"));
      callingDevice ??= this._getAvailableTel();
      if (!callingDevice)
        return Promise.reject(R.err("手柄离线或不可用，请检查", 6001));
      return Api.CallSessions.consultCall({
        callingDevice,
        calledDevice,
        activeDevice,
        userID,
        callType,
      });
    }

    /**
     * 转接
     * @param {String} heldDevice 被转接的用户号码
     * @param {String} heldUserID 被转接的用户ID
     * @param {String} calledDevice 咨询的用户号码
     * @param {String} userID 咨询的用户id
     * @returns
     */
    consultCallTransfer({ heldDevice, heldUserID, calledDevice, userID } = {}) {
      if (Util.isEmpty(heldDevice))
        return Promise.reject(R.err("被转接用户号码不能为空"));
      if (Util.isEmpty(calledDevice))
        return Promise.reject(R.err("转接用户号码不能为空"));
      return Api.CallSessions.consultCallTransfer({
        heldDevice,
        heldUserID,
        calledDevice,
        userID,
      });
    }
    /**
     * 取消转接
     * @param {String} callingDevice 主叫用户号码
     * @param {String} heldDevice 被转接的用户号码
     * @param {String} heldUserID 被转接的用户ID
     * @param {String} calledDevice 咨询的用户号码
     * @param {String} userID 咨询的用户id
     * @returns
     */
    consultCallReconnect({
      callingDevice,
      heldDevice,
      heldUserID,
      calledDevice,
      userID,
    } = {}) {
      if (Util.isEmpty(heldDevice))
        return Promise.reject(R.err("被转接用户号码不能为空"));
      if (Util.isEmpty(calledDevice))
        return Promise.reject(R.err("转接用户号码不能为空"));
      callingDevice ??= this._getAvailableTel();
      if (!callingDevice)
        return Promise.reject(R.err("手柄离线或不可用，请检查", 6001));
      return Api.CallSessions.consultCallReconnect({
        callingDevice,
        heldDevice,
        heldUserID,
        calledDevice,
        userID,
      });
    }

    /**
     * 强插
     * @param {Object} calledDevice
     * @param {String} userID
     * @returns
     */
    forceInsertCall({ calledDevice, userID } = {}) {
      if (Util.isEmpty(calledDevice))
        return Promise.reject(R.err("被强插用户号码不能为空"));
      let callingDevice = this._getAvailableTel();
      if (!callingDevice)
        return Promise.reject(R.err("手柄离线或不可用，请检查", 6001));
      return Api.CallSessions.forceInsertCall({
        callingDevice,
        calledDevice,
        userID,
      });
    }

    /**
     * 强拆
     * @param {Object} calledDevice
     * @param {String} userID
     * @returns
     */
    forceReleaseCall({ calledDevice, userID } = {}) {
      if (Util.isEmpty(calledDevice))
        return Promise.reject(R.err("被强拆用户号码不能为空"));
      let callingDevice = this._getAvailableTel();
      if (!callingDevice)
        return Promise.reject(R.err("手柄离线或不可用，请检查", 6001));
      return Api.CallSessions.forceReleaseCall({
        callingDevice,
        calledDevice,
        userID,
      });
    }

    /**
     * 强断
     * @param {Object} calledDevice
     * @param {String} userID
     * @returns
     */
    forceClearCall({ calledDevice, userID } = {}) {
      if (Util.isEmpty(calledDevice))
        return Promise.reject(R.err("被强断用户号码不能为空"));
      let callingDevice = this._getAvailableTel();
      if (!callingDevice)
        return Promise.reject(R.err("手柄离线或不可用，请检查", 6001));
      return Api.CallSessions.forceClearCall({
        callingDevice,
        calledDevice,
        userID,
      });
    }

    /**
     * 监听
     * @param {Object} calledDevice
     * @param {String} userID
     * @returns
     */
    monitorCall({ calledDevice, userID } = {}) {
      if (Util.isEmpty(calledDevice))
        return Promise.reject(R.err("被监听用户号码不能为空"));
      let callingDevice = this._getAvailableTel();
      if (!callingDevice)
        return Promise.reject(R.err("手柄离线或不可用，请检查", 6001));
      return Api.CallSessions.monitorCall({
        callingDevice,
        calledDevice,
        userID,
      });
    }

    /**
     * 获取用户呼入队列列表
     * @param {Integer} beginIndex 开始索引
     * @param {Integer} count 数量
     */
    getCallQueueStatusList({ beginIndex, count } = {}) {
      return Api.CallSessions.getCallQueueStatusList({
        beginIndex,
        count,
      });
    }

    /**
     * 获取号码状态列表
     * @param {Object}  data
     *
     * @param {String} groupID 组ID
     * @param {Integer} beginIndex 起始索引
     * @param {Integer} count 查询条数
     * @returns
     */
    getCallConnStatusList(data) {
      return Api.CallSessions.getCallConnStatusList(data);
    }

    /**
     * 获取号码详细状态信息
     *
     * @param {Object}  data
     *
     * @param {String} localDevice 号码
     * @param {String} userID 用户ID可空
     */
    getCallConnStatus(data) {
      return Api.CallSessions.getCallConnStatus(data);
    }

    /**
     * 获取获取通话录音录像列表
     *
     * @param {Object}  data
     *
     * @param {String} callID 呼叫任务编号
     * @param {String} beginTime 起始时间，可为空，格式：YYYYMMDDHHMMSS
     * @param {String} endTime 截止时间，可为空，格式：YYYYMMDDHHMMSS
     * @param {String} callingDevice 主叫号码
     * @param {String} calledDevice 被叫号码
     * @param {String} callDevice 通话的用户号码，主叫或被叫
     * @param {String} operatorID 操作员ID
     * @param {Integer} beginIndex 分页起始行
     * @param {Integer} count 分页数量
     */
    getCallRecordList(data) {
      return Api.CallSessions.getCallRecordList(data);
    }

    /**
     * 获取会议录音录像列表
     *
     * @param {Object}  data
     *
     * @param {String} meetID 会议ID
     * @param {String} beginTime 起始时间，可为空，格式：YYYYMMDDHHMMSS
     * @param {String} endTime 截止时间，可为空，格式：YYYYMMDDHHMMSS
     * @param {String} attendDevice 参会成员筛选，从attendName、attendTel数据中模糊查询
     * @param {String} calledDevice 被叫号码
     * @param {String} operatorID 操作员ID
     * @param {Integer} beginIndex 分页起始行
     * @param {Integer} count 分页数量
     */
    getMeetRecordList(data) {
      return Api.CallSessions.getMeetRecordList(data);
    }

    /**
     * 获取呼叫广播录音列表
     *
     * @param {Object}  data
     *
     * @param {String} broadcastID 广播任务编号
     * @param {String} beginTime 起始时间，可为空，格式：YYYYMMDDHHMMSS
     * @param {String} endTime 截止时间，可为空，格式：YYYYMMDDHHMMSS
     * @param {String} broadcastName 广播对象名称
     * @param {String} broadcastNum 广播对象号码
     * @param {String} operatorID 操作员ID
     * @param {Integer} beginIndex 分页起始行
     * @param {Integer} count 分页数量
     */
    getBroadcastRecordList(data) {
      return Api.CallSessions.getBroadcastRecordList(data);
    }

    /**
     * 获取主叫号码
     * @param {Boolean} isMicro 是否为手咪，现在软电话不区分手咪
     * @returns
     */
    _getAvailableTel(isMeeting = false, isMicro = false) {
      if (!this.client.operatorInfo) {
        this.log.warn("用户信息为空");
        return null;
      }

      let { mainTel, viceTel, mainTelType, viceTelType } =
        this.client.operatorInfo;
      let mainStatus = Util.isEmpty(this.client.telStatus[mainTel])
        ? DeviceState.IDLE
        : this.client.telStatus[mainTel];
      let viceStatus = Util.isEmpty(this.client.telStatus[viceTel])
        ? DeviceState.IDLE
        : this.client.telStatus[viceTel];

      // if (isMicro) {
      //   if (mainTelType === HandType.HAND_MICROPHONE)
      //     return mainStatus !== DeviceState.OFFLINE ? mainTel : null;
      //   return Util.isEmpty(viceTel) ||
      //     viceStatus === DeviceState.OFFLINE ||
      //     viceTelType !== HandType.HAND_MICROPHONE
      //     ? null
      //     : viceTel;
      // }

      if (Util.isEmpty(this.client.priorityTel)) {
        this.log.warn("_getAvailableTel isEmpty", this.client.priorityTel);
        if (Util.isEmpty(viceTel)) {
          this.client.priorityTel = mainTel;
        } else {
          if (mainStatus === DeviceState.OFFLINE) {
            this.client.priorityTel =
              viceStatus === DeviceState.OFFLINE ? mainTel : viceTel;
            return viceStatus === DeviceState.OFFLINE
              ? null
              : this.client.priorityTel;
          } else if (mainStatus === DeviceState.IDLE) {
            this.client.priorityTel = [
              DeviceState.OFFLINE,
              DeviceState.IDLE,
            ].includes(viceStatus)
              ? mainTel
              : viceTel;
          } else if (
            [DeviceState.TALK, DeviceState.HOLD].includes(mainStatus)
          ) {
            this.client.priorityTel = mainTel;
          } else if (
            [DeviceState.TALK, DeviceState.HOLD].includes(viceStatus)
          ) {
            this.client.priorityTel = viceTel;
          } else this.client.priorityTel = mainTel;
        }
      }
      this.log.warn("_getAvailableTel", this.client.priorityTel);
      return this.client.priorityTel;
    }
  }

  /**
   * 会议控制类
   */
  class ConferenceRoom {
    static LOG = Logger.prefix("ConferenceRoom");

    constructor(client) {
      this.client = client;
      this.systemMeetList = [];
      this.meetingCalling = new Map();
      this.supportedMixType = [1, 2, 4, 6, 8, 9, 13, 16];
    }

    /**
     * 初始化数据
     */
    _initData() {
      this.listMeet()
        .then((res) => {
          this.systemMeetList = res.data.list.filter(
            (m) => m.isSystem === YesOrNo.YES
          );
        })
        .catch((err) => {});
    }

    /**
     * 获取会议列表
     * {createID, meetType, beginIndex, count}
     * createID:会议创建者ID
     * meetType: 会议类型
     * beginIndex: 起始索引
     * count：数量
     * @param {Object} data
     */
    listMeet(data) {
      return new Promise((resolve, reject) => {
        Api.ConferenceRoom.listMeet(data)
          .then((res) => {
            let meetList = res.data.list;
            this.systemMeetList = meetList.filter(
              (m) =>
                m.createID === this.client.operatorInfo?.operatorID &&
                m.isSystem === YesOrNo.YES
            );
            res.data.list = meetList.filter((m) => m.meetMode !== "monitor");
            resolve(res);
          })
          .catch((err) => {
            reject(err);
          });
      });
    }

    /**
     * 创建会议
     * @param {Object}
     * @returns
     */
    createMeet({
      meetName,
      meetNum,
      meetMode,
      isAllowSpeak,
      callinState,
      callinNum,
      callinPwd,
    } = {}) {
      if (Util.isEmpty(meetName) && Util.isEmpty(meetNum)) {
        return Promise.reject(R.err("会议名称或会议号码不能为空"));
      }
      meetName ??= meetNum;
      meetNum ??= meetName;
      return Api.ConferenceRoom.createMeet({
        meetName,
        meetNum,
        meetMode,
        isAllowSpeak,
        callinState,
        callinNum,
        callinPwd,
      });
    }

    /**
     * 修改会议
     * @param {Object}
     * @returns
     */
    editMeet({
      meetID,
      meetName,
      meetNum,
      isAllowSpeak,
      callinState,
      callinNum,
      callinPwd,
    } = {}) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err("会议ID不能为空"));
      }
      if (Util.isEmpty(meetName) && Util.isEmpty(meetNum)) {
        return Promise.reject(R.err("会议名称或会议号码不能为空"));
      }
      meetName ??= meetNum;
      meetNum ??= meetName;
      return Api.ConferenceRoom.editMeet({
        meetID,
        meetName,
        meetNum,
        isAllowSpeak,
        callinState,
        callinNum,
        callinPwd,
      });
    }

    /**
     * 删除会议
     *
     * @param {String} meetID 会议ID
     */
    deleteMeet({ meetID } = {}) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err("会议ID不能为空"));
      }
      return Api.ConferenceRoom.destroyMeet({ meetID });
    }

    /**
     * 获取会议详细信息
     *
     * @param {String} meetID 会议ID
     */
    getMeetDetail({ meetID } = {}) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err("会议ID不能为空"));
      }
      return Api.ConferenceRoom.getMeetDetail({ meetID });
    }

    /**
     * 获取会议成员列表
     * @param {String} meetID 会议ID
     * @param {Integer} beginIndex 分页起始行
     * @param {Integer} count 分页数量
     * @returns
     */
    listMeetMember({ meetID, beginIndex, count } = {}) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err("会议ID不能为空"));
      }
      return Api.ConferenceRoom.listMeetMember({ meetID, beginIndex, count });
    }

    /**
     * 踢出成员
     */
    /**
     *
     * @param {Object} data
     *
     * meetID 会议ID
     * activeDevice 用户号码, 为空时表示会议所有成员踢出
     * userID 用户ID
     *
     * @returns
     */
    kickMeet(data = {}) {
      if (Util.isEmpty(data.meetID)) {
        return Promise.reject(R.err("会议ID不能为空"));
      }
      return Api.ConferenceRoom.kickMeet(data);
    }

    /**
     * 单独通话
     * @param {String} meetID 会议ID
     * @param {String} callingDevice 座席号码
     * @param {String} activeDevice 会议成员中的用户号码
     * @param {String} userID 用户ID
     * @returns
     */
    singleTalk({ meetID, callingDevice, activeDevice, userID } = {}) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err("会议ID不能为空"));
      }
      if (Util.isEmpty(activeDevice)) {
        return Promise.reject(R.err("会议成员号码不能为空"));
      }
      callingDevice ??= this.meetingCalling.get(meetID);
      if (!callingDevice) {
        callingDevice = this.client.callSessions._getAvailableTel(true);
        if (!callingDevice)
          return Promise.reject(R.err("手柄离线或不可用，请检查", 6001));
        this.meetingCalling.set(meetID, callingDevice);
      }
      return Api.ConferenceRoom.singleTalk({
        meetID,
        callingDevice,
        activeDevice,
        userID,
      });
    }

    /**
     * 回到会场
     * @param {String} meetID 会议ID
     * @param {String} activeDevice 单独通话中的用户号码
     * @param {String} userID 用户ID
     * @returns
     */
    backMeet({ meetID, activeDevice, userID } = {}) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err("会议ID不能为空"));
      }
      return Api.ConferenceRoom.backMeet({ meetID, activeDevice, userID });
    }

    /**
     * 禁言
     * @param {String} meetID 会议ID
     * @param {String} activeDevice 用户号码, 为空时禁止会议所有成员发言
     * @param {String} userID 用户ID
     * @returns
     */
    banSpeak({ meetID, activeDevice, userID } = {}) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err("会议ID不能为空"));
      }
      return Api.ConferenceRoom.banSpeak({ meetID, activeDevice, userID });
    }

    /**
     * 发言
     * @param {String} meetID 会议ID
     * @param {String} activeDevice 用户号码, 为空时允许会议所有成员发言
     * @param {String} userID 用户ID
     * @returns
     */
    allowSpeak({ meetID, activeDevice, userID } = {}) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err("会议ID不能为空"));
      }
      return Api.ConferenceRoom.allowSpeak({ meetID, activeDevice, userID });
    }

    /**
     * 会议混码
     * @param {String} meetID 会议ID
     * @param {Object []} sourceInfo 混码视频源节点，支持多个，source 的个数必须与 mixType 数值相同 {calledDevice:用户号码, userID:用户ID,videoID:视频监控ID,flowID:openvideo生成的flowID}
     * @param {Integer} mixType 混频类型，输出几分屏，目前支持：1，2，4，6，8，9，13，16
     * @param {String} videoType 视频类型，默认720P
     * @returns
     */
    startMeetVideoMix({
      meetID,
      sourceInfo,
      mixType = 1,
      videoType = "720P",
    } = {}) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err("会议ID不能为空"));
      }
      if (!this.supportedMixType.includes(mixType)) {
        return Promise.reject(R.err("不支持的混码类型"));
      }
      if (sourceInfo.length != mixType) {
        ConferenceRoom.LOG.info(
          "混码源和类型不匹配 ",
          mixType,
          JSON.stringify(sourceInfo)
        );
        return Promise.reject(R.err("混码源和类型不匹配"));
      }
      return Api.ConferenceRoom.startMeetVideoMix({
        meetID,
        sourceInfo,
        videoType,
        mixType,
      });
    }

    /**
     * 锁定会议
     * @param {String} meetID 会议ID
     * @param {String} isLocked 是否锁定会议 yes/no
     * @returns
     */
    lockMeet({ meetID, isLocked } = {}) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err("会议ID不能为空"));
      }
      if (Util.isEmpty(isLocked)) {
        return Promise.reject(R.err("锁定状态不能为空"));
      }
      return Api.ConferenceRoom.lockMeet({ meetID, isLocked });
    }

    /**
     * 会议广播
     * @param {String} meetID 会议ID
     * @param {String} isBroadcast 是否会议广播 yes/no
     * @param {String} fileName 语音文件
     * @returns
     */
    meetBroadcast({ meetID, isBroadcast = YesOrNo.YES, fileName } = {}) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err("会议ID不能为空"));
      }
      if (isBroadcast === YesOrNo.YES && Util.isEmpty(fileName)) {
        return Promise.reject(R.err("文件名不能为空"));
      }
      return Api.ConferenceRoom.meetBroadcast({
        meetID,
        isBroadcast,
        fileName,
      });
    }

    /**
     * 获取当前会议主叫号码
     */
    getMeetingCalling({ meetID } = {}) {
      return meetID ? this.meetingCalling.get(meetID) : null;
    }
  }

  /**
   * 云台控制命令
   */
  const PTZCommond = {
    PTZ_STOP: "PTZ_STOP", //停止控制
    ZOOM_IN: "ZOOM_IN", //焦距放大
    ZOOM_OUT: "ZOOM_OUT", //焦距缩小
    TILT_UP: "TILT_UP", //云台上仰
    TILT_DOWN: "TILT_DOWN", //云台下俯
    PAN_LEFT: "PAN_LEFT", //云台左转
    PAN_RIGHT: "PAN_RIGHT", //云台右转
  };

  /**
   * 视频控制类
   */
  class VideoSessions {
    constructor(client) {
      this.client = client;
    }

    /**
     * 获取视频通话图像
     * @param {String} calledDevice 用户号码
     * @param {String} userID 用户ID
     * @returns
     */
    getVideoPhoneRtspUrl({ calledDevice, userID } = {}) {
      if (Util.isEmpty(calledDevice)) {
        return Promise.reject(R.err("用户号码不能为空"));
      }
      return Api.VideoSessions.getVideoPhoneRtspUrl({ calledDevice, userID });
    }

    /**
     * 获取视频实时状态
     * @returns
     */
    listVideoStatus() {
      return Api.VideoSessions.listVideoStatus();
    }

    /**
     * 获取监控rtspUrl
     *
     * @param {Object} data 监控对象
     * @returns
     */
    getRtspUrl(data = {}) {
      if (Util.isEmpty(data)) return Promise.reject(R.err("监控数据不能为空"));
      if (data.videoMode == 0) {
        let rtspUrl = "rtsp://";
        if (!Util.isEmpty(data.userName) && !Util.isEmpty(data.userPwd))
          rtspUrl += data.userName + ":" + data.userPwd + "@";
        if (!Util.isEmpty(data.IPAddr) && !Util.isEmpty(data.IPPort))
          rtspUrl += data.IPAddr + ":" + data.IPPort;
        if (!Util.isEmpty(data.puid)) rtspUrl += "/" + data.puid;
        return Promise.resolve(R.ok({ rtspUrl }));
      }
      return Api.VideoSessions.openVideo({ videoID: data.videoID });
    }

    /**
     * 获取视频rtspUrl
     *
     * @param {String} videoID 监控id
     * @returns
     */
    openVideo({ videoID } = {}) {
      console.error("openVideo", videoID);
      if (Util.isEmpty(videoID)) return Promise.reject(R.err("监控ID不能为空"));
      return Api.VideoSessions.openVideo({ videoID });
    }

    /**
     * 关闭视频
     *
     * @param {String} flowID 打开后的监控、视频flowID
     * @returns
     */
    closeVideo({ flowID } = {}) {
      if (Util.isEmpty(flowID)) return Promise.reject(R.err("任务ID不能为空"));
      return Api.VideoSessions.closeVideo({ flowID });
    }
    /**
     * 云台控制
     *
     * @param {String} videoID 监控id
     * @param {String} command 控制命令 @see PTZCommond
     * @param {String} param 云台速度或聚焦倍率，取值范围0-255 默认值建议128
     * @returns
     */
    ptzControl({ videoID, command, param = "128" } = {}) {
      if (Util.isEmpty(videoID)) return Promise.reject(R.err("请选择监控"));
      if (Util.isEmpty(command))
        return Promise.reject(R.err("云台控制命令不能为空"));

      if (param < 1 || param > 255)
        return Promise.reject(R.err("云台速度值范围0-255"));
      return Api.VideoSessions.ptzControl({
        videoID,
        command,
        param: param + "",
      });
    }
  }

  /**
   * 短信控制类
   */
  class SmsSessions {
    constructor(client) {
      this.client = client;
    }

    /**
     * 获取短信列表
     *
     * @param {Integer} beginIndex 分页起始行
     * @param {Integer} count 分页数量
     * @returns
     */
    list(data) {
      return Api.SmsSessions.list(data);
    }

    /**
     * 获取短信详细信息
     *
     * @param {String} smsContacts 短信号码，获取某个联系人的所有短信时必填
     * @param {String} smsGroupID 群聊ID，获取群聊的短信时必填
     * @param {String} smsID 短信ID
     * @param {Integer} beginIndex 分页起始行
     * @param {Integer} count 分页数量
     * @returns
     */
    get(data = {}) {
      if (
        Util.isEmpty(data.smsContacts) &&
        Util.isEmpty(data.smsGroupID) &&
        Util.isEmpty(data.smsID)
      )
        return Promise.reject(R.err("短信ID、短信号码和群聊ID必选其一"));

      return Api.SmsSessions.get(data);
    }

    /**
     * 获取定时短信列表
     *
     * @param {Integer} beginIndex 分页起始行
     * @param {Integer} count 分页数量
     * @returns
     */
    crontab(data) {
      return Api.SmsSessions.crontab(data);
    }

    /**
     * 根据关键字获取短信列表
     *
     * @param {String} keyWord 搜索关键字，匹配号码、文本内容
     * @param {String} smsDirect 发送方向 send/recv
     * @param {String} smsStatus 短信状态
     * @param {String} smsRealFileName 文件名称
     * @param {String} beginTime 开始时间
     * @param {String} endTime 截止时间
     * @param {Integer} beginIndex 分页起始行
     * @param {Integer} count 分页数量
     * @returns
     */
    match(data) {
      return Api.SmsSessions.match(data);
    }

    /**
     * 短信发送
     *
     * @param {String} smsFormat 短信类型，sms文/photo图片/video视频/audio语音/file文件/gps定位
     * @param {String} smsContent 短信内容，支持中文，最大 1024 字节
     * @param {String} smsType 发送类型 single单发/group群发/chat群聊/mchat会议
     * @param {String[]} smsContacts 接收人的短信号码或座席 ID，支持群发多个，数组大小 1000。例 ["recv1","recv2"....]
     * @param {String} smsGroupID 群聊ID
     * @param {String} smsFileName 图片、视频上传到服务器的文件名（确保唯一性）
     * @param {String} smsRealFileName 图片、视频显示文件名称
     * @param {String} smsFileSize 文件大小，单位：字节
     * @param {String} sendTime 定时发送时间，格式YYYYMMDDHHMMSS
     * @returns
     */
    send({
      smsFormat = "sms",
      smsContent,
      smsType,
      smsContacts,
      smsGroupID,
      smsFileName,
      smsRealFileName,
      smsFileSize,
      sendTime,
    } = {}) {
      return new Promise((resolve, reject) => {
        if (
          Util.isEmpty(smsFormat) ||
          Util.isEmpty(smsType) ||
          (Util.isEmpty(smsContacts) && Util.isEmpty(smsGroupID))
        )
          return reject(R.err("参数缺失"));
        if (smsFormat === "sms") {
          if (Util.isEmpty(smsContent)) {
            return reject(R.err("短信内容不能为空"));
          }
        } else if (Util.isEmpty(smsFileName)) {
          return reject(R.err("文件名不能为空"));
        }
        //群聊ID为空，创建
        if (smsType === "chat" && Util.isEmpty(smsGroupID)) {
          this.setGroup({
            event: "smsGroupAdd",
            smsGroupName: "新建聊天室",
            smsContacts: smsContacts,
          })
            .then((res) => {
              smsGroupID = res.data.smsGroupID;
              Api.SmsSessions.send({
                smsFormat,
                smsContent,
                smsType,
                smsContacts,
                smsGroupID,
                smsFileName,
                smsRealFileName,
                smsFileSize,
                sendTime,
              })
                .then((res) => {
                  resolve(res);
                })
                .catch((err) => {
                  reject(err);
                });
            })
            .catch((err) => {
              reject(err);
            });
        } else {
          Api.SmsSessions.send({
            smsFormat,
            smsContent,
            smsType,
            smsContacts,
            smsGroupID,
            smsFileName,
            smsRealFileName,
            smsFileSize,
            sendTime,
          })
            .then((res) => {
              resolve(res);
            })
            .catch((err) => {
              reject(err);
            });
        }
      });
    }
    /**
     * 短信删除
     *
     * @param {String} smsContacts 短信号码或座席 ID，删除某个联系人的所有短信时必填
     * @param {String} smsID 短信任务ID，删除单条短信时填写
     * @param {String} smsGroupID 群聊ID，删除群聊组时填写
     *
     * @returns
     */
    delete({ smsID, smsContacts, smsGroupID } = {}) {
      if (
        Util.isEmpty(smsID) &&
        Util.isEmpty(smsContacts) &&
        Util.isEmpty(smsGroupID)
      )
        return Promise.reject(R.err("短信ID、短信号码和群聊ID必选其一"));
      return Api.SmsSessions.delete({ smsID, smsContacts, smsGroupID });
    }

    /**
     * 短信已读
     *
     * @param {String} smsContacts 短信号码或座席 ID，已读某个联系人的所有短信时必填
     * @param {String} smsID 短信任务ID，已读单条短信时填写
     * @param {String} smsGroupID 群聊ID，已读群聊组时填写
     *
     * @returns
     */
    read({ smsID, smsContacts, smsGroupID } = {}) {
      if (
        Util.isEmpty(smsID) &&
        Util.isEmpty(smsContacts) &&
        Util.isEmpty(smsGroupID)
      )
        return Promise.reject(R.err("短信ID、短信号码和群聊ID必选其一"));
      return Api.SmsSessions.read({ smsID, smsContacts, smsGroupID });
    }
    /**
     * 群聊设置
     *
     * @param {String} event 请求类型 smsGroupAdd/smsGroupMod/smsGroupDel/smsGroupContactAdd/smsGroupContactDel
     * @param {String} smsGroupName 群聊名称
     * @param {String} smsGroupID 群聊ID
     * @param {String[]} smsContacts 群聊成员的短信号码或座席 ID，支持群发多个，数组大小 1000，新增删除群聊成员时必填
     * @returns
     */
    setGroup({ event, smsGroupName, smsGroupID, smsContacts } = {}) {
      if (Util.hasEmpty(event)) return Promise.reject(R.err("参数缺失"));
      if (
        (event === "smsGroupAdd" || event === "smsGroupMod") &&
        isEmpty(smsGroupName)
      )
        return Promise.reject(R.err("参数缺失"));
      return Api.SmsSessions.setGroup({
        event,
        smsGroupName,
        smsGroupID,
        smsContacts,
      });
    }
    /**
     * 群聊查询
     *
     * @param {String} smsGroupID 群聊ID
     * @returns
     */
    getGroup({ smsGroupID } = {}) {
      if (Util.isEmpty(smsGroupID))
        return Promise.reject(R.err("群聊ID不能为空"));
      return Api.SmsSessions.getGroup({ smsGroupID });
    }
  }
  /**
   * 传真控制类
   */
  class FaxSessions {
    constructor(client) {
      this.client = client;
    }

    /**
     * 获取传真列表
     *
     * @param {Integer} beginIndex 分页起始行
     * @param {Integer} count 分页数量
     * @returns
     */
    list(data) {
      return Api.FaxSessions.list(data);
    }

    /**
     * 获取传真详细信息
     *
     * @param {String} faxContacts 传真号码，获取某个联系人的所有传真时必填
     * @param {String} faxGroupID 群发组ID，获取群聊的传真时必填
     * @param {Integer} beginIndex 分页起始行
     * @param {Integer} count 分页数量
     * @returns
     */
    get(data = {}) {
      if (Util.isEmpty(data.faxContacts) && Util.isEmpty(data.faxGroupID))
        return Promise.reject(R.err("传真号码和群发组ID必选其一"));

      return Api.FaxSessions.get(data);
    }

    /**
     * 获取定时传真列表
     *
     * @param {Integer} beginIndex 分页起始行
     * @param {Integer} count 分页数量
     * @returns
     */
    crontab(data) {
      return Api.FaxSessions.crontab(data);
    }

    /**
     * 根据关键字获取传真列表
     *
     * @param {String} keyWord 搜索关键字，匹配联系人
     * @param {String} faxDirect 发送方向 send/recv
     * @param {String} faxStatus 传真状态
     * @param {String} faxRealFileName 文件名称
     * @param {String} beginTime 开始时间
     * @param {String} endTime 截止时间
     * @param {Integer} beginIndex 分页起始行
     * @param {Integer} count 分页数量
     * @returns
     */
    match(data) {
      return Api.FaxSessions.match(data);
    }

    /**
     * 传真发送
     *
     * @param {String} faxContent 上传到服务器的文件名（确保唯一性）
     * @param {String} faxContacts 接收人的传真号码或座席 ID，支持群发多个，数组大小 1000
     * @param {String} faxGroupID 群发组ID
     * @param {String} faxRealFileName 传真显示文件名称
     * @param {String} faxFileSize 文件大小，单位：字节
     * @param {String} sendTime 定时发送时间，格式YYYYMMDDHHMMSS
     * @returns
     */
    send(data = {}) {
      if (Util.isEmpty(data.faxContent))
        return Promise.reject(R.err("内容不能为空"));
      if (Util.isEmpty(data.faxContacts))
        return Promise.reject(R.err("接收人不能为空"));
      if (Util.isEmpty(data.faxRealFileName)) data.faxRealFileName = "";
      return Api.FaxSessions.send(data);
    }

    /**
     * 传真删除
     *
     * @param {String} faxID 传真任务ID，删除单条传真时填写
     * @param {String} faxContacts 传真号码或座席 ID，删除某个联系人的所有传真时必填
     * @param {String} faxGroupID 群发组ID，删除群聊组时填写
     *
     * @returns
     */
    delete(data = {}) {
      if (
        Util.isEmpty(data.faxID) &&
        Util.isEmpty(data.faxContacts) &&
        Util.isEmpty(data.faxGroupID)
      )
        return Promise.reject(R.err("传真ID、传真号码和群发组ID必选其一"));
      return Api.FaxSessions.delete(data);
    }

    /**
     * 传真已读
     *
     * @param {String} faxID 传真任务ID，已读单条传真时填写
     * @param {String} faxContacts 传真号码或座席 ID，已读某个联系人的所有传真时必填
     * @param {String} faxGroupID 群发组ID，已读群聊组时填写
     *
     * @returns
     */
    read(data = {}) {
      if (
        Util.isEmpty(data.faxID) &&
        Util.isEmpty(data.faxContacts) &&
        Util.isEmpty(data.faxGroupID)
      )
        return Promise.reject(R.err("传真ID、传真号码和群发组ID必选其一"));
      return Api.FaxSessions.read(data);
    }
  }

  /**
   * 定位
   */
  class Location {
    constructor(client) {
      this.client = client;
    }

    /**
     * 位置订阅
     *
     * @param {String} mode 订阅或取消订阅 subscribe/unsubscribe
     * @param {String} deviceCode 订阅号码，为空代表订阅所有
     * @param {String[]} devices 订阅号码，多个
     */
    subscribe({ mode = "subscribe", deviceCode, devices } = {}) {
      return Api.Location.subscribe({ mode, deviceCode, devices });
    }
    /**
     * 获取定位位置信息(最近一次的更新)
     *
     * @param {String} deviceCode 定位号码
     * @param {String[]} devices 定位号码，多个
     * @param {Integer} beginIndex 分页起始行
     * @param {Integer} count 分页数量
     */
    last(data) {
      return Api.Location.last(data);
    }

    /**
     * 获取历史定位位置信息
     *
     * @param {String} deviceCode 定位号码
     * @param {String} start 起始时间，格式yyyymmddhhmmss
     * @param {String} end 截止时间，格式yyyymmddhhmmss
     * @param {Integer} beginIndex 分页起始行
     * @param {Integer} count 分页数量
     */
    history(data = {}) {
      if (Util.isEmpty(data.deviceCode))
        return R.toReject(ErrCode.PAMARA_INVALID, "定位号码不能为空");
      if (Util.isEmpty(data.start) || Util.isEmpty(data.end))
        return R.toReject(ErrCode.PAMARA_INVALID, "起始和结束时间不能为空");
      return Api.Location.history(data);
    }
  }

  /**
   * 文件类
   */
  class File {
    constructor(client) {
      this.client = client;
    }

    /**
     * 获取语音文件列表
     * @param {Object} data
     */
    listVoiceFile(data) {
      return Api.File.VoiceFile.list(data);
    }

    /**
     * 上传语音文件
     * @param {Object} options
     */
    uploadVoiceFile(options) {
      return Api.File.VoiceFile.upload(options);
    }

    /**
     * 编辑语音文件
     * @param {Object} data
     */
    editVoiceFile(data) {
      return Api.File.VoiceFile.edit(data);
    }

    /**
     * 删除语音文件
     * @param {String} fileid
     */
    deleteVoiceFile({ fileid } = {}) {
      if (Util.isEmpty(fileid)) return Promise.reject(R.err("文件ID不能为空"));
      return Api.File.VoiceFile.delete({ fileid });
    }

    getSmsFileUploadUrl() {
      return `${http.defaults.baseURL}/fileflow/smsfile/upload`;
    }
    getSmsFileUrl(filename = "") {
      return `${http.defaults.baseURL}/fileflow/smsfile/download/${filename}`;
    }

    /**
     * 短信文件上传
     * @param {Object} options: {file:文件}
     */
    uploadSmsFile(options) {
      return Api.File.SmsFile.upload(options);
    }

    /**
     * 短信文件下载
     * @param {String} filename
     */
    downloadSmsFile({ filename } = {}) {
      if (Util.isEmpty(filename))
        return Promise.reject(R.err("文件名不能为空"));
      return Api.File.SmsFile.download({ filename });
    }

    getFaxFileUploadUrl() {
      return `${http.defaults.baseURL}/fileflow/faxfile/upload`;
    }
    getFaxFileUrl(filename = "") {
      return `${http.defaults.baseURL}/fileflow/faxfile/download/${filename}`;
    }

    /**
     * 传真文件上传
     * @param {Object} options: {file:文件}
     */
    uploadFaxFile(options) {
      return Api.File.FaxFile.upload(options);
    }

    /**
     * 传真文件下载
     * @param {String} filename
     */
    downloadFaxFile({ filename }) {
      if (Util.isEmpty(filename))
        return Promise.reject(R.err("文件名不能为空"));
      return Api.File.FaxFile.download({ filename });
    }
  }

  /**
   * 数据存储类
   */
  class DataStorage {
    constructor(client) {
      this.client = client;
    }

    /**
     * 组操作
     * @param {String} dataAction @see DataAction
     * @param {Object} data 数据，查询时为查询条件，新增修改删除为数据体
     */
    groupSync(dataAction, data) {
      switch (dataAction) {
        case DataAction.ACTION_GET:
          return Api.Data.GroupSync.get(data);
        case DataAction.ACTION_LISTSUB:
          return Api.Data.GroupSync.listSub(data);
        case DataAction.ACTION_ADD:
          return Api.Data.GroupSync.add(data);
        case DataAction.ACTION_UPDATE:
          return Api.Data.GroupSync.edit(data);
        case DataAction.ACTION_DELETE:
          return Api.Data.GroupSync.delete(data);
        default:
          return Promise.reject(R.err("不支持的操作类型"));
      }
    }

    /**
     * 操作员操作
     * @param {String} dataAction @see DataAction
     * @param {Object} data 数据，查询时为查询条件，新增修改删除为数据体
     */
    operatorSync(dataAction, data) {
      switch (dataAction) {
        case DataAction.ACTION_LIST:
          return Api.Data.OperatorSync.list(data);
        case DataAction.ACTION_GET:
          return Api.Data.OperatorSync.get(data);
        case DataAction.ACTION_ADD:
          return Api.Data.OperatorSync.add(data);
        case DataAction.ACTION_UPDATE:
          return Api.Data.OperatorSync.edit(data);
        case DataAction.ACTION_DELETE:
          return Api.Data.OperatorSync.delete(data);
        case DataAction.ACTION_LISTID:
          return Api.Data.OperatorSync.listid(data);
        case DataAction.ACTION_COUNT:
          return Api.Data.OperatorSync.count();
        default:
          return Promise.reject(R.err("不支持的操作类型"));
      }
    }

    /**
     * 职员操作
     * @param {String} dataAction @see DataAction
     * @param {Object} data 数据，查询时为查询条件，新增修改删除为数据体
     */
    userSync(dataAction, data) {
      switch (dataAction) {
        case DataAction.ACTION_LIST:
          return Api.Data.UserSync.list(data);
        case DataAction.ACTION_GET:
          return Api.Data.UserSync.get(data);
        case DataAction.ACTION_ADD:
          return Api.Data.UserSync.add(data);
        case DataAction.ACTION_UPDATE:
          return Api.Data.UserSync.edit(data);
        case DataAction.ACTION_DELETE:
          return Api.Data.UserSync.delete(data);
        case DataAction.ACTION_LISTID:
          return Api.Data.UserSync.listid(data);
        default:
          return Promise.reject(R.err("不支持的操作类型"));
      }
    }

    /**
     * 视频组操作
     * @param {String} dataAction @see DataAction
     * @param {Object} data 数据，查询时为查询条件，新增修改删除为数据体
     */
    videoGroupSync(dataAction, data) {
      switch (dataAction) {
        case DataAction.ACTION_LISTSUB:
          return Api.Data.VideoGroupSync.listSub(data);
        case DataAction.ACTION_GET:
          return Api.Data.VideoGroupSync.get(data);
        case DataAction.ACTION_ADD:
          return Api.Data.VideoGroupSync.add(data);
        case DataAction.ACTION_UPDATE:
          return Api.Data.VideoGroupSync.edit(data);
        case DataAction.ACTION_DELETE:
          return Api.Data.VideoGroupSync.delete(data);
        default:
          return Promise.reject(R.err("不支持的操作类型"));
      }
    }

    /**
     * 视频监控操作
     * @param {String} dataAction @see DataAction
     * @param {Object} data 数据，查询时为查询条件，新增修改删除为数据体
     */
    videoSync(dataAction, data) {
      switch (dataAction) {
        case DataAction.ACTION_LIST:
          return Api.Data.VideoSync.list(data);
        case DataAction.ACTION_LISTID:
          return Api.Data.VideoSync.listid(data);
        case DataAction.ACTION_GET:
          return Api.Data.VideoSync.get(data);
        case DataAction.ACTION_ADD:
          return Api.Data.VideoSync.add(data);
        case DataAction.ACTION_UPDATE:
          return Api.Data.VideoSync.edit(data);
        case DataAction.ACTION_DELETE:
          return Api.Data.VideoSync.delete(data);
        default:
          return Promise.reject(R.err("不支持的操作类型"));
      }
    }

    /**
     * ACD管理
     *
     * @param {String} dataAction @see DataAction
     * @param {Object} data 数据，查询时为查询条件，新增修改删除为数据体
     */
    acdGroupSync(dataAction, data) {
      switch (dataAction) {
        case DataAction.ACTION_LIST:
          return Api.Data.AcdGroupSync.list(data);
        case DataAction.ACTION_ADD:
          return Api.Data.AcdGroupSync.add(data);
        case DataAction.ACTION_UPDATE:
          return Api.Data.AcdGroupSync.edit(data);
        case DataAction.ACTION_DELETE:
          return Api.Data.AcdGroupSync.delete(data);
        default:
          return Promise.reject(R.err("不支持的操作类型"));
      }
    }

    /**
     * ACD绑定调度管理
     *
     * @param {String} dataAction @see DataAction
     * @param {Object} data 数据，查询时为查询条件，新增修改删除为数据体
     */
    acdGroupSync(dataAction, data) {
      switch (dataAction) {
        case DataAction.ACTION_LIST:
          return Api.Data.AcdInfoSync.list(data);
        case DataAction.ACTION_ADD:
          return Api.Data.AcdInfoSync.add(data);
        case DataAction.ACTION_UPDATE:
          return Api.Data.AcdInfoSync.edit(data);
        case DataAction.ACTION_DELETE:
          return Api.Data.AcdInfoSync.delete(data);
        default:
          return Promise.reject(R.err("不支持的操作类型"));
      }
    }

    /**
     * 权限管理
     *
     * @param {String} dataAction @see DataAction
     * @param {Object} data 数据，查询时为查询条件，新增修改删除为数据体
     */
    rightGroupSync(dataAction, data) {
      switch (dataAction) {
        case DataAction.ACTION_LIST:
          return Api.Data.RightGroupSync.list(data);
        case DataAction.ACTION_GET:
          return Api.Data.RightGroupSync.get(data);
        case DataAction.ACTION_ADD:
          return Api.Data.RightGroupSync.add(data);
        case DataAction.ACTION_UPDATE:
          return Api.Data.RightGroupSync.edit(data);
        case DataAction.ACTION_DELETE:
          return Api.Data.RightGroupSync.delete(data);
        case DataAction.ACTION_LIST_RIGHT:
          return Api.Data.RightGroupSync.listModule(data);
        case DataAction.ACTION_LIST_RELATION:
          return Api.Data.RightGroupSync.listRelation(data);
        case DataAction.ACTION_SET:
          return Api.Data.RightGroupSync.setRelation(data);
        default:
          return Promise.reject(R.err("不支持的操作类型"));
      }
    }

    /**
     * 菜单管理
     *
     * @param {String} dataAction @see DataAction
     * @param {Object} data 数据，查询时为查询条件，新增修改删除为数据体
     */
    uiModuleSync(dataAction, data) {
      switch (dataAction) {
        case DataAction.ACTION_LIST:
          return Api.Data.UiModuleSync.list(data);
        case DataAction.ACTION_ADD:
          return Api.Data.UiModuleSync.add(data);
        case DataAction.ACTION_UPDATE:
          return Api.Data.UiModuleSync.edit(data);
        case DataAction.ACTION_DELETE:
          return Api.Data.UiModuleSync.delete(data);
        default:
          return Promise.reject(R.err("不支持的操作类型"));
      }
    }

    /**
     * 软电话配置
     *
     * @param {String} dataAction @see DataAction
     * @param {Object} data 数据，查询时为查询条件，新增修改删除为数据体
     */
    softphoneSync(dataAction, data) {
      switch (dataAction) {
        case DataAction.ACTION_LIST:
          return Api.Data.SoftphoneSync.list(data);
        case DataAction.ACTION_ADD:
          return Api.Data.SoftphoneSync.add(data);
        case DataAction.ACTION_UPDATE:
          return Api.Data.SoftphoneSync.edit(data);
        case DataAction.ACTION_DELETE:
          return Api.Data.SoftphoneSync.delete(data);
        default:
          return Promise.reject(R.err("不支持的操作类型"));
      }
    }

    /**
     * 黑名单操作
     * @param {String} dataAction @see DataAction
     * @param {Object} data 数据，查询时为查询条件，新增修改删除为数据体
     */
    blacklistSync(dataAction, data) {
      switch (dataAction) {
        case DataAction.ACTION_LIST:
        case DataAction.ACTION_LISTSUB:
          return Api.Data.BlacklistSync.list(data);
        case DataAction.ACTION_ADD:
          return Api.Data.BlacklistSync.add(data);
        case DataAction.ACTION_UPDATE:
          return Api.Data.BlacklistSync.edit(data);
        case DataAction.ACTION_DELETE:
          return Api.Data.BlacklistSync.delete(data);
        default:
          return Promise.reject(R.err("不支持的操作类型"));
      }
    }
  }

  /**
   * 定时器
   */
  class Timer {
    constructor() {}

    /**
     * keepalive定时器
     */
    static keepaliveTimer = null;

    /**
     * 客户端保活
     * @param {DispRTC.client} client
     */
    static keepalive(client) {
      this.keepaliveTimer && window.clearTimeout(this.keepaliveTimer);
      this.keepaliveTimer = setTimeout(async () => {
        DispRTC.client.log.info("keepalive", this.keepaliveTimer);
        // if (DispRTC.client && DispRTC.client === client) {
        if (DispRTC.client.token) {
          await Api.User.refreshToken()
            .then((res) => {})
            .catch((err) => {
              DispRTC.client.log.warn("keepalive err", JSON.stringify(err));
            });
        }

        Timer.keepalive();
        // }
      }, 1 * 60 * 1000);
    }

    /**
     * 清除定时器
     */
    static clearTimer() {
      this.keepaliveTimer && window.clearInterval(this.keepaliveTimer);
    }
  }

  /**
   * API
   */
  const Api = {
    //用户相关
    User: {
      login: (data) => http.post("/account/sign_in", data),
      refreshToken: () => http.post("/account/update_token"),
      logout: () => http.post("/account/sign_out"),
      getUserInfo: () => http.post("/dataflow/operator/get"),
      startWork: () => http.post("/account/work_start"),
      stopWork: () => http.post("/account/work_stop"),
      setUnattend: (data) => http.post("/account/setunattendmode", data),
      suspendRing: () => http.post("/account/suspendring"),
      listAgentStatus: (data) =>
        http.post("/account/operatorstatus/list", data),
      listOperatorLog: (data) => http.post("/account/operatorlog/list", data),
      password: (data) => http.post("/account/passwd", data),
    },
    //呼叫
    CallSessions: {
      getCdrList: (data) => http.post("/call_sessions/cdr/list", data),
      makeCall: (data) => http.post("/call_sessions/makecall", data),
      clearCall: () => http.post("/call_sessions/clearcall"),
      clearConnection: (data) =>
        http.post("/call_sessions/clearconnection", data),
      advanceCall: (data) => http.post("/call_sessions/advancecall", data),
      rollCall: (data) => http.post("/call_sessions/rollcall", data),
      endRollCall: (data) => http.post("/call_sessions/rollcallend", data),
      pollCall: (data) => http.post("/call_sessions/pollcall", data),
      endPollCall: (data) => http.post("/call_sessions/pollcallend", data),
      groupCall: (data) => http.post("/call_sessions/groupcall", data),
      endGroupCall: (data) => http.post("/call_sessions/groupcallend", data),
      selectCall: (data) => http.post("/call_sessions/selectcall", data),
      endSelectCall: (data) => http.post("/call_sessions/selectcallend", data),
      broadcastCall: (data) => http.post("/call_sessions/broadcastcall", data),
      endBroadcastCall: (data) =>
        http.post("/call_sessions/broadcastcallend", data),
      listTimingBroadcast: (data) =>
        http.post("/call_sessions/timingbroadcast/list", data),
      addTimingBroadcast: (data) =>
        http.post("/call_sessions/timingbroadcast/add", data),
      editTimingBroadcast: (data) =>
        http.post("/call_sessions/timingbroadcast/update", data),
      delTimingBroadcast: (data) =>
        http.post("/call_sessions/timingbroadcast/delete", data),
      holdCall: (data) => http.post("/call_sessions/holdcall", data),
      unholdCall: (data) => http.post("/call_sessions/unholdcall", data),
      singleTransferCall: (data) =>
        http.post("/call_sessions/singletransfercall", data),
      consultCall: (data) => http.post("/call_sessions/consultcall", data),
      consultCallTransfer: (data) =>
        http.post("/call_sessions/consultcall/transfer", data),
      consultCallReconnect: (data) =>
        http.post("/call_sessions/consultcall/reconnect", data),
      answerCall: (data) => http.post("/call_sessions/answercall", data),
      groupAnswerCall: (data) =>
        http.post("/call_sessions/groupanswercall", data),
      joinMeetCall: (data) => http.post("/call_sessions/joinmeetcall", data),
      recordCall: (data) => http.post("/call_sessions/recordcall", data),
      forceInsertCall: (data) =>
        http.post("/call_sessions/forceinsertcall", data),
      forceReleaseCall: (data) =>
        http.post("/call_sessions/forcereleasecall", data),
      forceClearCall: (data) =>
        http.post("/call_sessions/forceclearcall", data),
      monitorCall: (data) => http.post("/call_sessions/monitorcall", data),
      activateStun: (data) => http.post("/call_sessions/activatestun", data),
      getCallQueueStatusList: (data) =>
        http.post("/call_sessions/callqueuestatus/list", data),
      getCallConnStatusList: (data) =>
        http.post("/call_sessions/callconnstatus/list", data),
      getCallConnStatus: (data) =>
        http.post("/call_sessions/callconnstatus/get", data),
      getCallRecordList: (data) =>
        http.post("/call_sessions/callrecord/list", data),
      getMeetRecordList: (data) =>
        http.post("/call_sessions/meetrecord/list", data),
      getBroadcastRecordList: (data) =>
        http.post("/call_sessions/broadcastrecord/list", data),
    },
    //会议
    ConferenceRoom: {
      createMeet: (data) => http.post("/conference_room/create", data),
      editMeet: (data) => http.post("/conference_room/update", data),
      destroyMeet: (data) => http.post("/conference_room/destroy", data),
      lockMeet: (data) => http.post("/conference_room/meet_lock", data),
      meetBroadcast: (data) =>
        http.post("/conference_room/meet_broadcast", data),
      allowSpeak: (data) => http.post("/conference_room/meet_allowspeak", data),
      banSpeak: (data) => http.post("/conference_room/meet_banspeak", data),
      kickMeet: (data) => http.post("/conference_room/meet_kick", data),
      singleTalk: (data) => http.post("/conference_room/meet_singletalk", data),
      backMeet: (data) => http.post("/conference_room/meet_back", data),
      listMeet: (data) => http.post("/conference_room/list", data),
      getMeetDetail: (data) => http.post("/conference_room/get", data),
      listMeetMember: (data) =>
        http.post("/conference_room/meet_member_list", data),
      startMeetVideoMix: (data) =>
        http.post("/conference_room/startmeetvideomix", data),
    },
    //监控
    VideoSessions: {
      listVideoStatus: () =>
        http.post("/video_sessions/video_monitor/getallvideostatus"),
      openVideo: (data) =>
        http.post("/video_sessions/video_monitor/openvideo", data),
      closeVideo: (data) =>
        http.post("/video_sessions/video_monitor/closevideo", data),
      getVideoPhoneRtspUrl: (data) =>
        http.post("/video_sessions/video_phone/getvideortspurl", data),
      startVideoDispense: (data) =>
        http.post("/video_sessions/video_mix/startvideodispense", data),
      stopVideoDispense: (data) =>
        http.post("/video_sessions/video_mix/stopvideodispense", data),
      ptzControl: (data) =>
        http.post("/video_sessions/video_monitor/ptzcontrol", data),
    },
    //传真
    FaxSessions: {
      list: (data) => http.post("/fax_sessions/list", data),
      match: (data) => http.post("/fax_sessions/match", data),
      crontab: (data) => http.post("/fax_sessions/crontab/list", data),
      get: (data) => http.post("/fax_sessions/get", data),
      send: (data) => http.post("/fax_sessions/send", data),
      delete: (data) => http.post("/fax_sessions/delete", data),
      read: (data) => http.post("/fax_sessions/read", data),
    },
    //短信
    SmsSessions: {
      list: (data) => http.post("/sms_sessions/list", data),
      match: (data) => http.post("/sms_sessions/match", data),
      crontab: (data) => http.post("/sms_sessions/crontab/list", data),
      get: (data) => http.post("/sms_sessions/get", data),
      send: (data) => http.post("/sms_sessions/send", data),
      delete: (data) => http.post("/sms_sessions/delete", data),
      read: (data) => http.post("/sms_sessions/read", data),
      setGroup: (data) => http.post("/sms_sessions/group/set", data),
      getGroup: (data) => http.post("/sms_sessions/group/get", data),
    },
    //定位
    Location: {
      subscribe: (data) => http.post("/location/subscribe", data),
      last: (data) => http.post("/location/points/last", data),
      history: (data) => http.post("/location/points/history", data),
    },
    Data: {
      //部门
      GroupSync: {
        listSub: (data) => http.post("/dataflow/group/listsub", data),
        get: (data) => http.post("/dataflow/group/get", data),
        add: (data) => http.post("/dataflow/group/add", data),
        edit: (data) => http.post("/dataflow/group/update", data),
        delete: (data) => http.post("/dataflow/group/delete", data),
      },
      //操作员
      OperatorSync: {
        list: (data) => http.post("/dataflow/operator/list", data),
        listid: (data) => http.post("/dataflow/operator/listid", data),
        count: () => http.post("/dataflow/operator/count"),
        get: (data) => http.post("/dataflow/operator/get", data),
        add: (data) => http.post("/dataflow/operator/add", data),
        edit: (data) => http.post("/dataflow/operator/update", data),
        delete: (data) => http.post("/dataflow/operator/delete", data),
      },
      //用户
      UserSync: {
        list: (data) => http.post("/dataflow/employee/list", data),
        listid: (data) => http.post("/dataflow/employee/listid", data),
        get: (data) => http.post("/dataflow/employee/get", data),
        add: (data) => http.post("/dataflow/employee/add", data),
        edit: (data) => http.post("/dataflow/employee/update", data),
        delete: (data) => http.post("/dataflow/employee/delete", data),
      },
      VideoGroupSync: {
        listSub: (data) => http.post("/dataflow/videogroup/listsub", data),
        get: (data) => http.post("/dataflow/videogroup/get", data),
        add: (data) => http.post("/dataflow/videogroup/add", data),
        edit: (data) => http.post("/dataflow/videogroup/update", data),
        delete: (data) => http.post("/dataflow/videogroup/delete", data),
      },
      VideoSync: {
        list: (data) => http.post("/dataflow/videoinfo/list", data),
        listid: (data) => http.post("/dataflow/videoinfo/listid", data),
        get: (data) => http.post("/dataflow/videoinfo/get", data),
        add: (data) => http.post("/dataflow/videoinfo/add", data),
        edit: (data) => http.post("/dataflow/videoinfo/update", data),
        delete: (data) => http.post("/dataflow/videoinfo/delete", data),
      },
      SoftphoneSync: {
        list: (data) => http.post("/dataflow/softphone/list", data),
        add: (data) => http.post("/dataflow/softphone/add", data),
        edit: (data) => http.post("/dataflow/softphone/update", data),
        delete: (data) => http.post("/dataflow/softphone/delete", data),
      },
      BlacklistSync: {
        list: (data) => http.post("/dataflow/blacklist/list", data),
        add: (data) => http.post("/dataflow/blacklist/add", data),
        edit: (data) => http.post("/dataflow/blacklist/update", data),
        delete: (data) => http.post("/dataflow/blacklist/delete", data),
      },
      AcdGroupSync: {
        list: (data) => http.post("/dataflow/acdgroup/list", data),
        add: (data) => http.post("/dataflow/acdgroup/add", data),
        edit: (data) => http.post("/dataflow/acdgroup/update", data),
        delete: (data) => http.post("/dataflow/acdgroup/delete", data),
      },
      AcdInfoSync: {
        list: ({ acdGroupID }) =>
          http.get(`/dataflow/acdinfo/listget/${acdGroupID}`),
        add: (data) => http.post("/dataflow/acdinfo/add", data),
        edit: (data) => http.post("/dataflow/acdinfo/update", data),
        delete: (data) => http.post("/dataflow/acdinfo/delete", data),
      },
      RightGroupSync: {
        list: (data) => http.post("/dataflow/rightgroup/list", data),
        get: (data) => http.post("/dataflow/rightgroup/get", data),
        listRelation: (data) =>
          http.post("/dataflow/rightgroup/relation/list", data),
        setRelation: (data) =>
          http.post("/dataflow/rightgroup/relation/set", data),
        listModule: () => http.get("/dataflow/rightgroup/rightmodule/list"),
        add: (data) => http.post("/dataflow/rightgroup/add", data),
        edit: (data) => http.post("/dataflow/rightgroup/update", data),
        delete: (data) => http.post("/dataflow/rightgroup/delete", data),
      },
      UiModuleSync: {
        list: (params) => {
          return http({
            url: "/dataflow/module/list",
            params,
            method: "get",
          });
        },
        add: (data) => http.post("/dataflow/module/add", data),
        edit: (data) => http.post("/dataflow/module/update", data),
        delete: (data) => http.post("/dataflow/module/delete", data),
      },
      DataSort: {
        group: () => http.post("/dataflow/group/sort"),
        operator: () => http.post("/dataflow/operator/sort"),
        employee: () => http.post("/dataflow/employee/sort"),
        videoGroup: () => http.post("/dataflow/videogroup/sort"),
        video: () => http.post("/dataflow/videoinfo/sort"),
      },
    },
    File: {
      VoiceFile: {
        list: (data) => http.post("/fileflow/voicefile/list", data),
        upload: (data) => uploadFile("/fileflow/voicefile/upload", data),
        edit: (data) => http.post("/fileflow/voicefile/update", data),
        delete: (data) => http.post("/fileflow/voicefile/delete", data),
      },
      SmsFile: {
        upload: (data) => uploadFile("/fileflow/smsfile/upload", data),
        download: ({ filename }) =>
          http.get(`/fileflow/smsfile/download/${filename}`),
      },
      FaxFile: {
        upload: (data) => uploadFile("/fileflow/faxfile/upload", data),
        download: ({ filename }) =>
          http.get(`/fileflow/faxfile/download/${filename}`),
      },
    },
  };

  /**
   * 文件上传
   * @param {*} api
   * @param {*} options
   * @returns
   */
  const uploadFile = (api, options) => {
    return new Promise((resolve, reject) => {
      let formData = new FormData();
      formData.append("file", options.file);
      http
        .post(api, formData, {
          headers: { "Content-Type": "multipart/form-data" },
          //上传进度
          onUploadProgress: (progressEvent) => {
            let num = ((progressEvent.loaded / progressEvent.total) * 100) | 0; //百分比
            options.onProgress && options.onProgress({ percent: num }); //进度条
          },
        })
        .then((res) => {
          options.onSuccess && options.onSuccess(); //上传成功(打钩的小图标)
          resolve(res);
        })
        .catch((err) => {
          reject(err);
        });
    });
  };

  const getUserMediaError = (e, t) => {
    switch (e) {
      case "Starting video failed":
      case "OverconstrainedError":
      case "TrackStartError":
        return new Err(
          ErrCode.MEDIA_OPTION_INVALID,
          "".concat(e, ": ").concat(t)
        );
      case "NotFoundError":
      case "DevicesNotFoundError":
        return new Err(ErrCode.DEVICE_NOT_FOUND, "".concat(e, ": ").concat(t));
      case "NotSupportedError":
        return new Err(
          ErrCode.DEVICES_NOT_SUPPORTED,
          "".concat(e, ": ").concat(t)
        );
      case "NotReadableError":
        return new Err(
          ErrCode.DEVICES_NOT_READABLE,
          "".concat(e, ": ").concat(t)
        );
      case "InvalidStateError":
      case "NotAllowedError":
      case "PERMISSION_DENIED":
      case "PermissionDeniedError":
        return new Err(ErrCode.PERMISSION_DENIED, "".concat(e, ": ").concat(t));
      case "ConstraintNotSatisfiedError":
        return new Err(
          ErrCode.CONSTRAINT_NOT_SATISFIED,
          "".concat(e, ": ").concat(t)
        );
      default:
        Logger.error("getUserMedia unexpected error", e);
        return new Err(ErrCode.UNEXPECTED_ERROR, "".concat(e, ": ").concat(t));
    }
  };

  /**
   * 构造返回结果类
   * 统一返回{code:200,data:{},msg:'success'}
   */
  class R {
    constructor(code, data, msg) {
      this.code = code;
      this.data = data;
      this.msg = msg;
    }

    reject() {
      return Promise.reject(this);
    }

    resolve() {
      return Promise.resolve(this);
    }

    /**
     * 返回成功消息
     * @param {any} data 数据
     * @returns
     */
    static ok(data, msg) {
      return new R(200, data, msg);
    }

    /**
     * 返回错误消息
     * @param {string|Err} msg 错误消息 / Err
     * @param {int} code 状态码
     * @returns
     */
    static err(msg, code = 0, data) {
      if (msg instanceof Code) {
        return new R(msg.value, data, code || msg.msg);
      }
      if (msg instanceof Err) {
        return new R(msg.code, msg.data, msg.message);
      }
      return new R(code, data, msg);
    }

    static toReject(code = 0, msg, data) {
      return this.err(code, msg, data).reject();
    }

    static toResolve(data, msg) {
      return this.ok(data, msg).resolve();
    }

    static reject(data) {
      return Promise.reject(data);
    }

    static resolve(data) {
      return Promise.resolve(data);
    }
  }

  class Code {
    constructor(value, msg) {
      this.msg = msg;
      this.value = value;
    }

    toString() {
      return JSON.stringify(this);
    }
  }

  /**
   * 错误码
   */
  const ErrCode = new (class {
    constructor() {
      this.PAMARA_INVALID = new Code(1000, "参数校验错误");
      this.SDK_NOT_SUPPORTED = new Code(1001, "该浏览器不支持该SDK");
      this.USERNAME_OR_PWD_BLANK = new Code(1002, "用户名或密码为空");
      this.AXIOS_NOT_FOUND = new Code(1003, "请导入axios依赖");
      this.UNATTEND_TEL_BLANK = new Code(1005, "值班值守号码不能为空");
      this.ONLY_MODIFY_OWN_INFO = new Code(1006, "只能修改本人信息");
      this.LEFT_HANDLE_BLANK = new Code(1007, "左手柄号码不能为空");
      this.PARAMS_IS_EMPTY = new Code(1008, "参数为空");
      this.ENUMERATE_DEVICES_SUPPORTED = new Code(2000, "不支持获取设备信息");
      this.ENUMERATE_DEVICES_FAILED = new Code(2002, "获取设备信息失败");
      this.MEDIA_OPTION_INVALID = new Code(2003, "媒体参数错误");
      this.DEVICE_NOT_FOUND = new Code(2004, "没有找到设备信息");
      this.DEVICES_NOT_SUPPORTED = new Code(2006, "设备不支持");
      this.DEVICES_NOT_READABLE = new Code(2007, "设备不支持");
      this.PERMISSION_DENIED = new Code(2008, "设备禁止访问");
      this.CONSTRAINT_NOT_SATISFIED = new Code(2009, "参数不支持");
      this.UNEXPECTED_ERROR = new Code(2010, "异常错误");
      this.CREATE_OFFER_FAILED = new Code(2011, "创建Offer失败");
      this.NUMBER_OR_PWD_EMPTY = new Code(2012, "号码或密码为空");
      this.FRAMERATE_IS_POSITIVE_INTEGER = new Code(2013, "帧率只能是正整数");
      this.RESOLUTION_IS_POSITIVE_INTEGER = new Code(
        2014,
        "分辨率只能是正整数"
      );
      this.NUMBER_OR_PWD_EMPTY = new Code(2015, "号码或密码为空");
      this.SOFTPHONE_RIGISTER_ERROR = new Code(2016, "软电话注册失败");
      this.DEVICE_IS_EMPTY = new Code(2017, "请输入视频源");
      this.DEVICE_NOT_OPEN = new Code(2018, "输入源没有打开");
      this.MEDIA_RECORDER_CREATE_FAILED = new Code(2019, "录音失败");
      this.RTSP_PLAY_FAILED = new Code(3000, "RTSP播放失败");
      this.RTSP_NOT_PLAY = new Code(3001, "RTSP视频未播放");
    }
  })();

  class Err extends Error {
    constructor(code, msg, data) {
      if (code instanceof Code) {
        msg = msg || code.msg;
        code = code.value;
      }

      super(msg);
      this.code = code;
      this.name = "DispRTCError";
      this.message = msg;
      this.data = data;

      this.print();
    }
    toString() {
      return this.data
        ? "data: ".concat(JSON.stringify(this.data), "\n").concat(this.stack)
        : "code:".concat(this.code, "\n").concat(this.stack);
    }
    print() {
      Logger.error(this.toString());
      return this;
    }
    throw() {
      throw this;
    }

    promise() {
      return Promise.reject(this);
    }
  }

  const Browser = new (class {
    constructor() {
      this.log = Logger.prefix("Browser");
      this.isAccessMicrophonePermission = false;
      this.isAccessCameraPermission = false;
    }

    /**
     * 检查Web SDK对正在使用的浏览器的适配情况
     * @returns Boolean true支持 false不支持
     */
    checkRequirements() {
      try {
        const e = window.RTCPeerConnection,
          i = navigator.mediaDevices && navigator.mediaDevices.getUserMedia,
          r = window.WebSocket;
        return !!(e && i && r);
      } catch (e) {
        this.log.error("check browser requirement failed: ", e);
        return false;
      }
    }

    /**
     * 是否支持Websocket
     */
    checkSupportWebsocket() {
      try {
        return !!window.WebSocket;
      } catch (e) {
        this.log.error("check browser support websocket failed: ", e);
        return false;
      }
    }

    /**
     * 获取摄像头
     *
     * @param {boolean} isSkipPermissionCheck 是否跳过权限检查
     * @returns Promise<MediaDeviceInfo[]>
     * @see https://developer.mozilla.org/en-US/docs/Web/API/MediaDeviceInfo
     */
    async getCameras(skipPermissionCheck = true) {
      return (
        await this.enumerateDevices(false, true, skipPermissionCheck)
      ).filter((e) => "videoinput" === e.kind);
    }

    /**
     * 获取扬声器
     * @param {boolean} isSkipPermissionCheck 是否跳过权限检查
     * @returns Promise<MediaDeviceInfo[]>
     * @see https://developer.mozilla.org/en-US/docs/Web/API/MediaDeviceInfo
     */
    async getSpeakers(skipPermissionCheck = true) {
      return (
        await this.enumerateDevices(true, false, skipPermissionCheck)
      ).filter((e) => "audiooutput" === e.kind);
    }

    /**
     * 获取麦克风
     * @param {boolean} isSkipPermissionCheck 是否跳过权限检查
     * @returns Promise<MediaDeviceInfo[]>
     * @see https://developer.mozilla.org/en-US/docs/Web/API/MediaDeviceInfo
     */
    async getMicrophones(skipPermissionCheck = true) {
      return (
        await this.enumerateDevices(true, true, skipPermissionCheck)
      ).filter((e) => "audioinput" === e.kind);
    }

    /**
     * 获取浏览器webrtc支持的编码
     */
    async getSupportedCodec() {
      let e = { audio: [], video: [] };
      try {
        let PC = new RTCPeerConnection();
        PC.addTransceiver("video", { direction: "recvonly" }),
          PC.addTransceiver("audio", { direction: "recvonly" });
        const sdp = (await PC.createOffer()).sdp;
        if (!sdp) return e;
        PC.close();
        PC = null;
        e = ((e) => {
          const t = { video: [], audio: [] };
          return (
            e.match(/ VP8/i) && t.video.push("VP8"),
            e.match(/ VP9/i) && t.video.push("VP9"),
            e.match(/ AV1/i) && t.video.push("AV1"),
            e.match(/ H264/i) && t.video.push("H264"),
            e.match(/ opus/i) && t.audio.push("OPUS"),
            e.match(/ PCMU/i) && t.audio.push("PCMU"),
            e.match(/ PCMA/i) && t.audio.push("PCMA"),
            e.match(/ G722/i) && t.audio.push("G722"),
            t
          );
        })(sdp);
      } catch (e) {
        throw new Err(
          ErrCode.CREATE_OFFER_FAILED,
          e.toString && e.toString()
        ).print();
      }
      return e;
    }

    checkMediaDeviceInfoIsOk(devices) {
      const t = devices.filter((e) => "audioinput" === e.kind),
        i = devices.filter((e) => "videoinput" === e.kind),
        r = { audio: false, video: false };
      for (const e of t)
        if (e.label && e.deviceId) {
          r.audio = true;
          break;
        }
      for (const e of i)
        if (e.label && e.deviceId) {
          r.video = true;
          break;
        }
      return r;
    }
    async enumerateDevices(isAudio, isVideo, isSkipPermissionCheck) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return new Err(ErrCode.ENUMERATE_DEVICES_SUPPORTED);
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      let deviceInfo = this.checkMediaDeviceInfoIsOk(devices);
      this.log.info("deviceInfo", deviceInfo);
      let o = !this.isAccessMicrophonePermission && isAudio,
        s = !this.isAccessCameraPermission && isVideo;
      deviceInfo.audio && (o = false);
      deviceInfo.video && (s = false);

      let a = null,
        c = null,
        d = null;
      if (!isSkipPermissionCheck && (o || s)) {
        if (o && s) {
          try {
            d = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: true,
            });
          } catch (e) {
            const t = getUserMediaError(e.name || e.code || e, e.message);
            if (t.code === ErrCode.PERMISSION_DENIED.value) return t.promise();
            this.log.warn("getUserMedia failed in getDevices", t);
          }
          this.isAccessCameraPermission = true;
          this.isAccessMicrophonePermission = true;
        } else if (o) {
          try {
            a = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (e) {
            const t = getUserMediaError(e.name || e.code || e, e.message);
            this.log.warn("getUserMedia failed in getDevices", t);
            if (t.code === ErrCode.PERMISSION_DENIED.value) return t.promise();
          }
          this.isAccessMicrophonePermission = true;
        } else if (s) {
          try {
            c = await navigator.mediaDevices.getUserMedia({ video: true });
          } catch (e) {
            const t = getUserMediaError(e.name || e.code || e, e.message);
            if (t.code === ErrCode.PERMISSION_DENIED.value) return t.promise();
            this.log.warn("getUserMedia failed in getDevices", t);
          }
          this.isAccessCameraPermission = true;
        }
        this.log.debug(
          "[device manager] mic permission",
          e,
          "cam permission",
          t
        );
      }
      try {
        const e = await navigator.mediaDevices.enumerateDevices();
        return (
          a && a.getTracks().forEach((e) => e.stop()),
          c && c.getTracks().forEach((e) => e.stop()),
          d && d.getTracks().forEach((e) => e.stop()),
          (a = null),
          (c = null),
          (d = null),
          e
        );
      } catch (e) {
        a && a.getTracks().forEach((e) => e.stop()),
          c && c.getTracks().forEach((e) => e.stop()),
          d && d.getTracks().forEach((e) => e.stop()),
          (a = null),
          (c = null),
          (d = null);
        return R.toReject(ErrCode.ENUMERATE_DEVICES_FAILED);
      }
    }
  })();

  /**
   * socketio连接状态码
   */
  const ConnectCode = {
    /**
     * 客户端退出登录
     */
    logout: -1,
    /**
     * 连接成功
     */
    connect: 0,
    /**
     * 已断开与服务器的连接
     */
    disconnect: 1,
    /**
     * 正在重连
     */
    attempt: 2,
    /**
     * 重连(不登录)成功
     */
    reconnect: 3,
    /**
     * 重连(登录)成功
     */
    login: 4,
  };

  /**
   * websocket客户端
   */
  class WsClient {
    static instances = new Map();

    constructor(token, client) {
      this.token = token;
      this.client = client;
      this.ws = null;
      this.closed = false;
    }

    connection() {
      if (!DispRTC.client || this.client !== DispRTC.client) {
        this.client.log.warn("Client还未创建，或者已改变，不进行Websocket连接");
        return null;
      }
      if (typeof io === "undefined") {
        this.client.log.warn("请导入socket.io依赖");
        client.emit("SOCKET_IO_LACK", {
          eventType: "SOCKET_IO_LACK",
          data: "缺少socket.io依赖",
        });
        return null;
      }
      let ws = (this.ws = io(DispRTC.client.server, {
        transports: ["websocket"],
        path: "/socket.io",
        query: {
          token: this.token,
        },
        timeout: 5000,
      }));
      ws.on("connect", (data) => {
        this.client.log.warn(
          "socket connect状态",
          ws.connected ? "连接成功" : "连接失败",
          data
        );
      });
      ws.on("disconnect", () => {
        this.client.log.warn(
          "socket disconnect 已断开与服务器的连接",
          this.closed
        );
        !this.closed &&
          this.client.emit(EventType.LOGIN_STATUS, {
            eventType: EventType.LOGIN_STATUS,
            data: { code: ConnectCode.disconnect, msg: "已断开与服务器的连接" },
          });
      });

      ws.on("error", (error) => {
        this.client.log.warn("socket error", error);
      });

      ws.on("connect_error", (error) => {
        //服务器断开连接，会自动重连，不需处理
        this.client.log.warn("socket connect_error", error);
      });

      ws.on("message", (data) => {
        //token错误，客户端重登
        if (data && data.code === 403) {
          this.client.log.warn("socket message token错误，客户端重登", data);
          clearCLient(403);
        }
      });

      ws.on("close", (data) => {
        this.client.log.warn("socket close", data);
      });
      ws.on("reconnect_attempt", (attemptNumber) => {
        this.client.log.warn(`socket 正在尝试第${attemptNumber}次重连...`);
      });
      ws.on("reconnect", (attemptNumber) => {
        this.client.log.warn(
          `socket 已重连至服务器，一共尝试了${attemptNumber}次`
        );
        //执行更新token操作，判断token是否正常
        Api.User.refreshToken()
          .then((res) => {
            //正常，重新获取数据
            this.client._initData(false);
            this.client.emit(EventType.LOGIN_STATUS, {
              eventType: EventType.LOGIN_STATUS,
              data: { code: ConnectCode.reconnect, msg: "重连成功" },
            });
          })
          .catch((err) => {
            //错误不处理 axios拦截器已处理
          });
      });

      //接收上报事件
      ws.on(this.token, (data) => {
        // this.client.log.debug('socket token', JSON.stringify(data));
        if (DispRTC.client && DispRTC.client === this.client) {
          this.client.emit(data.eventType, data);
          this.handleMsg(data);
        } else {
          this.close();
        }
      });

      return this;
    }

    handleMsg(data) {
      switch (data.eventType) {
        case EventType.LOGIN_STATUS:
          this.handleLoginStatus(data);
          break;
        case EventType.AGENT_STATUS_EVENT:
          this.handleAgentStatus(data, this.client);
          break;
        case EventType.CALL_CONN_STATUS_EVENT:
          this.handleDeviceStatus(data);
          break;
        case EventType.OPERATOR_EVENT_MOD:
          // if (
          //   this.client.operatorInfo &&
          //   data.data.operatorID === this.client.operatorInfo.operatorID
          // ) {
          //   await this.client._getOperatorInfo(true, true);
          // }
          break;
        case EventType.MEET_MEMBER_EVENT_DEL:
          this.client.conferenceRoom.meetingCalling.delete(data.data.meetID);
          break;
      }
    }

    handleLoginStatus(data) {
      //已在其他地方登录
      if (data.data.code === 480) {
        clearCLient(480);
      }
    }

    handleAgentStatus(data, client) {
      data = data.data;
      if (client && client.operatorInfo?.operatorID) {
        if (data.agentState === AgentState.STOP) {
          client.connectionState = {
            user_id: data.user_id,
            agentState: ConnectionAgentState.CONNECTED_WORKSTOP,
          };
        } else if (data.agentState === AgentState.LOGIN) {
          client.connectionState = {
            user_id: data.user_id,
            agentState: ConnectionAgentState.CONNECTED_WORKSTART,
          };
        } else if (data.agentState === AgentState.WORKING_AFTER_CALL) {
          client.connectionState = {
            user_id: data.user_id,
            agentState: ConnectionAgentState.CONNECTED_WORKAFTERCALL,
            unattendDevice: data.unattendDevice,
          };
        }
      }
    }

    handleDeviceStatus(data) {
      data = data.data;
      let { localDevice, localState, direct } = data;
      let { mainTel, viceTel, viceTelType } = this.client.operatorInfo;
      if (
        !Util.isEmpty(localDevice) &&
        (localDevice === mainTel || localDevice === viceTel)
      ) {
        this.client.telStatus[localDevice] = localState;

        let mainStatus = Util.isEmpty(this.client.telStatus[mainTel])
          ? DeviceState.IDLE
          : this.client.telStatus[mainTel];
        let viceStatus = Util.isEmpty(this.client.telStatus[viceTel])
          ? DeviceState.IDLE
          : this.client.telStatus[viceTel];
        if (localDevice === mainTel) {
          //拨打接入号，切换手柄
          if (direct === "callin" && localState === DeviceState.HOLD) {
            this.client.priorityTel = mainTel;
          } else if (localState === DeviceState.OFFLINE) {
            if (!Util.isEmpty(viceTel) && viceStatus !== DeviceState.OFFLINE) {
              this.client.priorityTel = viceTel;
            }
          } else if (localState === DeviceState.IDLE) {
            if (![DeviceState.IDLE, DeviceState.OFFLINE].includes(viceStatus)) {
              this.client.priorityTel = viceTel;
            } else {
              this.client.priorityTel = mainTel;
            }
          }
        } else if (!Util.isEmpty(viceTel) && localDevice === viceTel) {
          //拨打接入号，切换手柄
          if (direct === "callin" && localState === DeviceState.HOLD) {
            this.client.priorityTel = viceTel;
          } else if (localState === DeviceState.OFFLINE) {
            this.client.priorityTel = mainTel;
          } else if (localState === DeviceState.IDLE) {
            if (mainStatus !== DeviceState.OFFLINE) {
              this.client.priorityTel = mainTel;
            } else {
              this.client.priorityTel = viceTel;
            }
          }
        }
      }
    }

    close() {
      this.closed = true;
      this.client.log.info("关闭socketio");
      this.ws && (this.ws.close(), (this.ws = null));
    }
  }

  /**
   * 客户端
   * 用于连接后台以及所有操作
   */
  class Client {
    constructor(options) {
      this.log = Logger.prefix("Client");
      this.proxy = options.proxy || false;
      this.server = options.server;
      this.softPhoneServer = this.server.startsWith("http:")
        ? this.server.replace("http:", "ws:")
        : this.server.replace("https:", "wss:");

      this.token = options.token || Store.get("token"); //登录后token
      this.singleSignOn = options.singleSignOn ?? false; //是否为单点登录
      this.keepalive = options.keepalive ?? true;
      this.registerSoftphone = options.registerSoftphone ?? true; //是否注册软电话
      this.reLogin = this.keepalive !== false; //是否重登录

      this.isReLogining = false; //是否正在重登录

      this.debug = options.debug || false; //是否开启日志 默认false不开启
      this.username = options.username; //用户名
      this.password = options.password; //密码
      this.operatorInfo = null; //操作员信息
      this.connectionState = null; //连接状态
      this.telStatus = {}; //操作员号码状态
      this.priorityTel = null; //优先呼出手柄
      this.wsClient = null;
      this.callSessions = new CallSessions(this);
      this.videoSessions = new VideoSessions(this);
      this.conferenceRoom = new ConferenceRoom(this);
      this.smsSessions = new SmsSessions(this);
      this.faxSessions = new FaxSessions(this);
      this.location = new Location(this);
      this.dataStorage = new DataStorage(this);
      this.file = new File(this);
      this.eventMap = {}; //事件集合
      this.onceEventMap = {}; // 单次事件集合，只执行一次
      this.event = new Proxy(
        {},
        {
          set: (target, property, fn) => {
            this.eventMap[property] || (this.eventMap[property] = []);
            //同一个事件和同一个回调函数不再添加
            !this.eventMap[property].some((f) => f == fn) &&
              this.eventMap[property].push(fn);
            return true;
          },
        }
      );
      this.onceEvent = new Proxy(
        {},
        {
          set: (target, property, fn) => {
            this.onceEventMap[property] || (this.onceEventMap[property] = []);
            //同一个事件和同一个回调函数不再添加
            !this.onceEventMap[property].some((f) => f == fn) &&
              this.onceEventMap[property].push(fn);
            return true;
          },
        }
      );

      Util.isNotEmpty(this.token) && this._setToken(this.token);
      if (options.token) {
        // Store.remove("user")
        this._initData();
      }

      //绑定事件
      options.ons && options.ons.forEach((e) => this.on(e.name, e.fn));
    }

    /**
     * 登录
     * @param {String} username 用户名
     * @param {String} password 密码
     * @returns
     */
    async login(username, password) {
      if (!username || !password) {
        return R.toReject(ErrCode.USERNAME_OR_PWD_BLANK);
      }

      let form = {
        user_name: username,
        signature: Util.sign(username, password),
      };

      Store.set({ name: Store.Keys.user, content: form });

      let result = await Api.User.login(form)
        .then((res) => {
          this._setToken(res.data.access_token);
          this.reLogin = this.keepalive !== false;

          this.emit(EventType.LOGIN_STATUS, {
            eventType: EventType.LOGIN_STATUS,
            data: { code: 200, msg: "登录成功", token: res.data.access_token },
          });

          try {
            this._initData();
          } catch (error) {}
          return res;
        })
        .catch((err) => {
          this.log.error("登录失败", err);
          return Promise.reject(err);
        });
      return result;
    }

    /**
     * 登出
     * @returns
     */
    async logout() {
      if (!this._isLogin()) return R.toResolve();
      await Api.User.logout()
        .then((res) => {
          this._setToken(null);
          Timer.clearTimer();
          this.wsClient && this.wsClient.close();
          this.wsClient = null;

          return res;
        })
        .catch((err) => {
          this.log.error("登出失败", err);
          return Promise.reject(err);
        });
    }

    /**
     * 开班
     * @returns
     */
    startWork() {
      return Api.User.startWork();
    }
    /**
     * 关班
     * @returns
     */
    stopWork() {
      return Api.User.stopWork();
    }

    /**
     * 值班值守
     * @param {string} calledDevice 值守号码
     * @param {string} mode 值守模式，可传入（open开启、close关闭）。缺省为open
     * @returns
     */
    async setUnattend(calledDevice, mode = UnattendMode.OPEN) {
      if (Util.isEmpty(calledDevice)) R.toReject(ErrCode.UNATTEND_TEL_BLANK);
      return Api.User.setUnattend({ calledDevice, mode });
    }

    /**
     * 闭铃
     * @returns
     */
    suspendRing() {
      return Api.User.suspendRing();
    }

    /**
     * 获取操作员信息
     */
    getOperatorInfo() {
      return this._getOperatorInfo();
    }

    /**
     * 获取操作员坐席状态
     * {groupID:string; beginIndex?:number; count?:number}
     * @returns
     */
    getOperatorStatusList(data) {
      return Api.User.listAgentStatus(data);
    }

    /**
     * 获取操作日志
     * {keyWord:string;beginTime?:string;endTime?:string; beginIndex?:number;count?:number}
     * @returns
     */
    getOperatorLogList(data) {
      return Api.User.listAgentStatus(data);
    }

    /**
     * 获取当前客户端状态
     * @returns
     */
    getConnectionState() {
      return R.resolve(this.connectionState);
    }

    /**
     * 客户端是否为连接状态
     * @returns
     */
    isConnected() {
      return this._isLogin();
    }

    /**
     * 绑定事件
     * @param {String} name 事件名称,为后台上报的事件名称
     * @param {Function} fn 回调函数
     */
    on(name, fn) {
      //只有事件名称存在才绑定
      if (
        name &&
        Object.values(EventType).includes(name) &&
        typeof fn === "function"
      ) {
        this.event[name] = fn;
        //绑定非单次事件，删除单次事件
        let funs = this.onceEventMap[name];
        let index;
        if (funs && (index = funs.findIndex((f) => f == fn)) != -1) {
          funs.splice(index, 1);
        }
      }
      return this;
    }

    /**
     * 绑定单次事件,ALL事件不永许单次订阅
     * @param {String} name
     * @param {Function} fn
     */
    once(name, fn) {
      //只有事件名称存在才绑定
      if (
        name &&
        name !== EventType.ALL &&
        Object.values(EventType).includes(name) &&
        typeof fn === "function"
      ) {
        //绑定单次事件，其他事件
        this.off(name, fn);
        this.onceEvent[name] = fn;
      }
      return this;
    }
    /**
     * 移除非单次事件
     * @param {String} name 事件名称
     * @param {Function} fn 存在则移除与该回调函数相关的事件
     */
    off(name, fn) {
      if (name) {
        if (fn) {
          let funs = this.eventMap[name];
          let index;
          if (funs && (index = funs.findIndex((f) => f == fn)) != -1) {
            funs.splice(index, 1);
          }
          //删除单次事件
          funs = this.onceEventMap[name];
          if (funs && (index = funs.findIndex((f) => f == fn)) != -1) {
            funs.splice(index, 1);
          }
        } else {
          delete this.eventMap[name];
          delete this.onceEventMap[name];
        }
      }
      return this;
    }
    /**
     * 移除单次事件
     * @param {String} name 事件名称
     */
    offOnce(name) {
      if (name) {
        delete this.onceEventMap[name];
      }
      return this;
    }
    /**
     * 清楚所有事件
     */
    offAll() {
      this.eventMap = {};
      this.onceEventMap = {};
      return this;
    }
    /**
     * 派发事件，即回调
     * @param {String} name 事件名
     * @param  {...any} val 消息
     */
    emit(name, val) {
      try {
        if (name !== EventType.ALL) {
          this.eventMap[name] &&
            this.eventMap[name].forEach((fn) => {
              fn(val);
            });
          this.onceEventMap[name] &&
            (this.onceEventMap[name].forEach((fn) => {
              fn(val);
            }),
            this.offOnce(name));
        }
        //派发给ALL
        this.eventMap[EventType.ALL] &&
          this.eventMap[EventType.ALL].forEach((fn) => {
            fn(val);
          });
      } catch (error) {
        this.log.error("派发事件失败", error);
      }
    }

    /**
     * 获取罗电话配置
     * @returns
     */
    async listSoftPhoneConfig() {
      return await Api.Data.SoftphoneSync.list({
        operatorID: this.operatorInfo.operatorID,
      })
        .then((res) => {
          let tel,
            list = [];
          if (
            (tel = res.data.list.find(
              (e) => e.phone === this.operatorInfo.mainTel
            ))
          ) {
            list.push({
              ID: tel.ID,
              phone: tel.phone,
              enabled: tel.enabled,
              password: tel.password,
              operatorID: tel.operatorID,
              phoneType: tel.phoneType === "1" ? "1" : "0",
              telType: "main",
            });
          } else if (
            (tel = res.data.list.find(
              (e) => e.phone === this.operatorInfo.viceTel
            ))
          ) {
            list.push({
              ID: tel.ID,
              phone: tel.phone,
              enabled: tel.enabled,
              password: tel.password,
              operatorID: tel.operatorID,
              phoneType: tel.phoneType === "1" ? "1" : "0",
              telType: "vice",
            });
          }

          res.data.list = list;

          return R.resolve(res);
        })
        .catch((err) => {
          this.log.error("获取罗电话配置失败", err);
          return R.reject(err);
        });
    }

    /**
     * 软电话设置
     * @param {*} config
     * @returns
     */
    async setSoftPhoneConfig(config = {}) {
      if (Util.hasEmpty(config.operatorID, config.phone, config.enabled)) {
        return R.toReject(ErrCode.PAMARA_INVALID);
      }
      if (config.enabled === 1 && Util.isEmpty(config.password)) {
        return R.toReject(ErrCode.PAMARA_INVALID);
      }
      config.phoneType = config.phoneType === "1" ? "1" : "0";
      if (config.ID) {
        await Api.Data.SoftphoneSync.edit(config)
          .then((res) => {
            this._softPhoneRegister(
              {
                phone: config.phone,
                password: config.password,
                wsServer: this.softPhoneServer,
                phoneType: this.operatorInfo.mainTelType,
                autoAccept: config.phoneType === "1",
                enabled: config.enabled,
              },
              config.phone === this.operatorInfo.mainTel ? "main" : "vice"
            );
          })
          .catch((err) => {
            this.log.error("修改软电话信息失败", err);
            return R.reject(err);
          });
      } else {
        // config = Object.assign(config, {
        //   sipHost: "",
        //   sipPort: 0,
        //   wsHost: "",
        //   wsPort: 0,
        // });
        await Api.Data.SoftphoneSync.add(config)
          .then((res) => {
            if (config.enabled === 1) {
              this._softPhoneRegister(
                {
                  phone: config.phone,
                  password: config.password,
                  wsServer: this.softPhoneServer,
                  phoneType: this.operatorInfo.mainTelType,
                  autoAccept: config.phoneType === "1",
                },
                config.phone === this.operatorInfo.mainTel ? "main" : "vice"
              );
            } else {
              let old = RTCStream.instances.get(config.phone);
              if (old) old._unRegister();
            }
          })
          .catch((err) => {
            this.log.error("添加软电话信息失败", err);
            return R.reject(err);
          });
      }
      return R.toResolve();
    }

    /**
     * 设置个人信息，用于修改自己的信息
     */
    async setProfile(data = {}) {
      if (
        !data.operatorID ||
        data.operatorID !== this.operatorInfo.operatorID
      ) {
        return R.toReject(ErrCode.ONLY_MODIFY_OWN_INFO);
      }
      if (Util.isEmpty(data.mainTel)) {
        return R.toReject(ErrCode.LEFT_HANDLE_BLANK);
      }
      return await Api.Data.OperatorSync.edit(data)
        .then(async (res) => {
          this._getOperatorInfo(true, true);
          return R.resolve(res);
        })
        .catch((err) => {
          this.log.error("修改个人信息失败", err);
          return R.reject(err);
        });
    }

    /**
     * 修改密码
     * oldPwd
     * newPwd
     */
    changePassword(data) {
      return Api.User.password(data);
    }

    /**
     * 获取手柄类型 左/右
     * @param {String} callingDevice
     */
    getHandleType(callingDevice) {
      return this.operatorInfo?.viceTel === callingDevice ? "vice" : "main";
    }

    /**
     * 获取操作员信息
     */
    async _getOperatorInfo(initData = false, refresh = false) {
      if (!refresh && this.operatorInfo) return R.toResolve(this.operatorInfo);
      else
        return await Api.User.getUserInfo()
          .then((res) => {
            this.operatorInfo = res.data.list[0];
            initData && this.registerSoftphone && this._initTel();

            this.connectionState &&
              (this.connectionState.user_id = this.operatorInfo.operatorID);

            return R.toResolve(this.operatorInfo);
          })
          .catch((err) => {
            this.log.error("获取操作员信息失败", err);
            return R.reject(err);
          });
    }

    setToken(token) {
      this._setToken(token);
      if (Util.isNotEmpty(token)) {
        this._initData();
      }
    }

    /**
     * 关闭保活
     */
    clearKeepalive() {
      Timer.clearTimer();
      this.reLogin = false;
    }

    _setToken(token, errCode) {
      this.token = token;
      if (Util.isEmpty(token)) {
        this.connectionState = {
          agentState: ConnectionAgentState.DISCONNECTED,
          reason: errCode
            ? errCode === 403
              ? ConnectionDisconnectedReason.DISCONNECTED_ERROR
              : ConnectionDisconnectedReason.DISCONNECTED_OFFLINE
            : ConnectionDisconnectedReason.DISCONNECTED_LEAVE,
        };
        Store.remove("token");
      } else {
        this.connectionState = {
          agentState: ConnectionAgentState.CONNECTED_WORKSTART,
        };
        Store.set({ name: Store.Keys.token, content: token });
      }
    }

    /**
     * 是否已登录
     * @returns
     */
    _isLogin() {
      return Util.isNotEmpty(this.token) || Util.isNotEmpty(Store.get("token"));
    }

    /**
     * 重登录
     */
    async _reLogin() {
      if (this.isReLogining) {
        return;
      }
      this.isReLogining = true;

      this.log.info("与服务器断开连接，正在重新连接。。。", this.isReLogining);
      this.emit(EventType.LOGIN_STATUS, {
        eventType: EventType.LOGIN_STATUS,
        data: {
          code: ConnectCode.disconnect,
          msg: "与服务器断开连接，正在重新连接",
        },
      });

      const form = Store.get("user");

      this.log.info("与服务器断开连接，正在重新连接, Store.getUer", form);

      if (form) {
        this.connectionState = {
          agentState: ConnectionAgentState.RECONNECTING,
        };
        let startTime = new Date();
        try {
          await Api.User.login(form).then((res) => {
            this.isReLogining = false;
            this.log.info("重登录成功。。。");
            this._setToken(res.data.access_token);
            this.reLogin = true;
            try {
              this._initData();
            } catch (error) {}

            this.emit(EventType.LOGIN_STATUS, {
              eventType: EventType.LOGIN_STATUS,
              data: {
                code: ConnectCode.login,
                msg: "与服务器断开连接，重新连接成功",
                token: res.data.access_token,
              },
            });
          });
        } catch (error) {
          this.log.error("重登录失败", error);
          let endTime = new Date();
          let time = endTime.getTime() - startTime.getTime();
          if (time < 5000) {
            await sleep(5000 - time);
          }
          await this._reLogin();
        }
      } else {
        this.log.info("与服务器断开连接，用户信息为空不进行重登");
        this.emit(EventType.LOGIN_STATUS, {
          eventType: EventType.LOGIN_STATUS,
          data: {
            code: ConnectCode.logout,
            msg: "与服务器断开连接，用户信息为空不进行重登",
          },
        });
      }
    }

    /**
     * 初始化数据
     * @returns
     */
    async _initData(openWs = true) {
      if (!this._isLogin()) {
        return;
      }
      //获取用户信息
      this._getOperatorInfo(true, !openWs);
      //获取系统默认会议
      this.conferenceRoom._initData();

      !DispRTC.client && (DispRTC.client = this);
      //开启websocket
      this.server &&
        openWs &&
        (this.wsClient = new WsClient(this.token, this).connection());

      //保活
      this.keepalive && Timer.keepalive(this);
    }

    async _initTel() {
      //软电话注册
      this._initSoftPhone();
      this.telStatus = {};
      //号码状态或号码优先
      setTimeout(async () => {
        let { mainTel, viceTel } = this.operatorInfo;
        await this.callSessions
          .getCallConnStatus({ localDevice: mainTel })
          .then((res) => {
            this.telStatus[mainTel] = res.data.localState;
          });
        viceTel &&
          (await this.callSessions
            .getCallConnStatus({ localDevice: viceTel })
            .then((res) => {
              this.telStatus[viceTel] = res.data.localState;
            }));
        if (Util.isEmpty(viceTel)) {
          this.priorityTel = mainTel;
        } else {
          if (
            !this.priorityTel ||
            ![mainTel, viceTel].includes(this.priorityTel)
          ) {
            if (this.telStatus[mainTel] === DeviceState.OFFLINE) {
              this.priorityTel =
                this.telStatus[viceTel] === DeviceState.OFFLINE
                  ? mainTel
                  : viceTel;
            } else if (this.telStatus[mainTel] === DeviceState.IDLE) {
              this.priorityTel = [
                DeviceState.OFFLINE,
                DeviceState.IDLE,
              ].includes(this.telStatus[viceTel])
                ? mainTel
                : viceTel;
            } else {
              this.priorityTel = mainTel;
            }
          }
        }
      }, 1000);
    }

    /**
     * 软电话注册
     */
    _initSoftPhone() {
      //处理用户号码状态
      let { mainTel, viceTel, operatorID, mainTelType, viceTelType } =
        this.operatorInfo;
      //获取软电话配置
      let olds = RTCStream.getInstances();
      olds.forEach((e) => {
        if (e.phone !== mainTel && e.phone !== viceTel) {
          e._unRegister();
        }
      });
      Api.Data.SoftphoneSync.list({ operatorID })
        .then((res) => {
          let softs = res.data.list;
          let registerIndex = softs.findIndex((e) => e.phone === mainTel);
          if (registerIndex === -1) {
            registerIndex = softs.findIndex(
              (e) => viceTel && e.phone === viceTel
            );
          }
          for (let i = 0; i < softs.length; i++) {
            let e = softs[i];
            if (registerIndex !== i) {
              Api.Data.SoftphoneSync.delete({ ID: e.ID })
                .then((res) => {})
                .catch((err) => {});
            } else {
              this._softPhoneRegister(
                {
                  phone: e.phone,
                  password: e.password,
                  wsServer: this.softPhoneServer,
                  phoneType: e.phone === mainTel ? mainTelType : viceTelType,
                  autoAccept: e.phoneType === "1",
                  enabled: e.enabled,
                },
                e.phone === this.operatorInfo.mainTel ? "main" : "vice"
              );
            }
          }
        })
        .catch((err) => {
          this.log.info("软电话配置init失败");
        });
    }

    /**
     * 软电话注册
     * @param {Object} config
     * @returns
     */
    _softPhoneRegister(config, handleType) {
      let old = RTCStream.instances.get(config.phone);
      if (old) {
        if (config.enabled === 0) {
          old._unRegister();
        } else {
          old.handleType = handleType;
          old.autoAccept = config.autoAccept;
        }
        return;
      }
      if (config.enabled === 1) {
        // 创建对象
        let rtcStream = new RTCStream({
          phone: config.phone,
          password: config.password,
          wsServer: config.wsServer,
          phoneType: config.phoneType,
          handleType: handleType,
          autoAccept: config.autoAccept,
          client: this,
        });

        // 初始化并注册
        rtcStream.init();
      }
    }

    /**
     * 获取模块信息
     * @returns
     */
    getModules(data) {
      return Api.Data.UiModuleSync.list(data);
    }
  }

  const DispRTC = new (class {
    constructor() {
      this.version = "1.0.0";
      this.options = null;
      this.log = Logger.prefix("DispRTC");

      /**
       * 因为系统只可能是一个操作员登录，所以只有一个客户端
       */
      this.client = null;
    }
    /**
     * 创建客户端
     * @param {Object} options
     * {
     *    server:'', //服务器url
     *    token: '', //登录后的token，用于刷新页面创建Client, 与用户名密码二选一
     *    debug: false, //是否开启debug日志 默认false不开启打印error日志
     * }
     *
     * @returns
     */
    createClient(options) {
      if (typeof axios === "undefined") {
        return new Err(ErrCode.AXIOS_NOT_FOUND, "请导入axios依赖").throw();
      }
      if (options.proxy) {
        options.server = location.origin;
        window.http = http = createAxois(options.server + "/api/v2");
      } else {
        if (!options.server) {
          return new Err(ErrCode.PAMARA_INVALID, "服务器地址不能为空").throw();
        }
        if (
          !options.server.startsWith("http:") &&
          !options.server.startsWith("https:")
        ) {
          return new Err(
            ErrCode.PAMARA_INVALID,
            "请输入正确的服务器地址，以http:或https:开头"
          ).throw();
        }
        http = createAxois(options.server + "/api/v2");
      }

      Logger.setLogLevel(options.debug ? 0 : 3);

      return (this.client = new Client(options));
    }

    /**
     * 创建createRTSPtream
     * @param {Object} options
     *
     * @returns
     */
    createRTCStream(options = {}) {
      return new RTCStream();
    }
    createRTSPStream(options = {}) {
      if (!options.server) {
        if (this.client) options.server = this.client.server;
        else {
          return new Err(ErrCode.PAMARA_INVALID, "服务器地址不能为空").throw();
        }
      }
      if (
        Util.isEmpty(options.rtspUrl) ||
        (!(options.remoteVideo instanceof HTMLElement) &&
          Util.isEmpty(options.remoteVideo))
      ) {
        return new Err(
          ErrCode.PAMARA_INVALID,
          "rtsp地址或video标签不能为空"
        ).throw();
      }
      return new RTSPStream(options);
    }

    /**
     * 获取RTCtream
     *
     * @returns
     */
    static getRTCStream(name) {
      return name
        ? RTCStream.getInstanceByName(name)
        : RTCStream.getInstances();
    }

    /**
     * 销毁Client客户端
     */
    async destroy() {
      if (Util.isNotEmpty(this.client)) {
        Util.isNotEmpty(this.client.wsClient) && this.client.wsClient.close();
        if (Util.isNotEmpty(this.client.token)) {
          try {
            await this.client.logout();
          } catch (error) {}
          this.client.operatorInfo = null;
          this.client.token = "";
          Timer.clearTimer();
        }
      }

      console.warn("销毁Client客户端");

      RTCStream.destroy();
      Store.clear();

      return R.ok();
    }
  })();

  /**
   * RTCStream配置信息
   */
  class RTCStreamOptions {
    constructor(options = {}) {
      this.audio = options.audio || true; //是否采集音频
      this.video = options.video || false; //是否采集视频
      this.cameraId = options.cameraId; //摄像头设备deviceId，通过getCameras获取
      this.microphoneId = options.microphoneId; //麦克风设备deviceId，通过getMicrophones获取
      this.speakerId = options.speakerId; //扬声器设备deviceId，通过getSpeakers获取
      this.client = options.client; //要RTCStream绑定的client实例对象,默认是最初使用createClient创建的Client实例
      this.server = options.server; //服务器连接信息, 缺省默认createClient配置的server地址
      this.ringtone = options.ringtone; // HTMLElement，振铃音的DOM容器audio节点
      this.ringbacktone = options.ringtone; // 回铃音的DOM容器audio节点
    }
  }

  /**
   * RTSPStream配置信息
   */
  class RTSPStreamOptions {
    constructor(options = {}) {
      this.rtspUrl = options.rtspUrl; //rtsp地址
      this.video = options.video; //HTMLElement，rtsp播放的video元素
      this.client = options.client; //要RTCStream绑定的client实例对象,默认是最初使用createClient创建的Client实例
      this.server = options.server; //服务器连接信息, 缺省默认createClient配置的server地址
    }
  }

  /**
   * 客户端连接状态信息
   */
  class ConnectionState {
    constructor(options = {}) {
      this.user_id = options.user_id; //客户端座席ID，相等于OperatorID
      this.agentState = options.agentState; //客户端连接状态
      this.unattendDevice = options.unattendDevice; //值守号码
      this.reason = options.reason; //当agentState为“Disconnected”，这里表示断开连接的原因
    }
  }

  /**
   * 操作员信息
   */
  class OperatorInfo {
    operatorID = new String();
    constructor(options = {}) {
      this.operatorID = options.operatorID; //调度员唯一编号
      this.userName = options.userName; //调度员登录名
      this.realName = options.realName; //调度员真实姓名，用于显示
      this.rightGroupID = options.rightGroupID; //权限角色ID
      this.groupID = options.groupID; //所属调度组ID
      this.videoID = options.videoID; //绑定监控ID，支持多个,array
      this.mainTel = options.mainTel; //左手柄号码
      this.viceTel = options.viceTel; //右手柄号码
      this.mainTelType = options.mainTelType; //左手柄类型 phone 话机 / hand_microphone 手咪
      this.viceTelType = options.viceTelType; //右手柄类型
      this.priorityLevel = options.priorityLevel; //座席优先级
      this.userType = options.userType; //座席类型，operator：普通 monitor：班长座席
      this.mobile = options.mobile; //手机号码
      this.faxTel = options.faxTel; //传真号码
      // this.bcTel = options.bcTel //广播号码
      // this.pocTel = options.pocTel //集群号码
      this.onDuty = options.onDuty; //值班功能开启 true/关闭 false(默认关闭)
      this.dutyTel = options.dutyTel; //值班电话号码
      this.pos_x = options.pos_x; //经度
      this.pos_y = options.pos_y; //纬度
      this.gpsBH = options.gpsBH; //GPS编号
      this.remark = options.remark; //备注
      this.softKey = options.softKey; //密钥ID
      this.icoType = options.icoType; //图标类型
      this.orderNO = options.orderNO; //排列序号
      this.agent = options.agent; //座席信息 {agentState:座席状态, unattendDevice:值守号码}
    }
  }

  /**
   * 操作日志
   */
  class OperatorLog {
    constructor(options = {}) {
      this.user_id = options.user_id; //座席id
      this.user_name = options.user_name; //座席登录名
      this.clientIPAddr = options.clientIPAddr; //IP地址
      this.logTime = options.logTime; //日志时间
      this.logName = options.logName; //操作名称
      this.logDescription = options.logDescription; //操作描述
    }
  }

  /**
   * 部门信息
   */
  class GroupInfo {
    constructor(options = {}) {
      this.groupID = options.groupID; //部门唯一编号
      this.fullName = options.fullName; //部门全称
      this.groupName = options.groupName; //部门简称
      this.groupType = options.groupType; //部门类型 organ 普通部门 /dispatchgroup 调度组
      this.parentID = options.parentID; //上级部门ID
      this.keyNumber = options.keyNumber; //按键值
      this.remark = options.remark; //备注
      this.icoType = options.icoType; //图标类型
      this.pos_x = options.pos_x; //经度
      this.pos_y = options.pos_y; //纬度
      this.province = options.province; //省
      this.city = options.city; //市
      this.district = options.district; //区
      this.bstrOperatorID = options.bstrOperatorID; //自定义组所属用户的user_id
      this.orderNO = options.orderNO; //排列序号
    }
  }

  const sdk = {
    version: sdkVersion,
    createClient: DispRTC.createClient,
    createRTCStream: DispRTC.createRTCStream,
    createRTSPStream: DispRTC.createRTSPStream,
    destroy: DispRTC.destroy,
    RTCStream: RTCStream,
    RTSPStream: RTSPStream,
    Browser: Browser,
    Types: {
      RTCStreamOptions,
      RTSPStreamOptions,
      ConnectionState,
      ConnectionDisconnectedReason,
      ConnectionAgentState, //客户端连接状态信息
      VideoResolutionQuality,
      VideoFrameRate,
      DataAction, //数据操作动作
      OperatorInfo,
      OperatorLog,
      GroupInfo,

      EventType, //事件集合枚举
      DuplexMode, //双工模式
      CallType, //呼叫类型
      MeetMode, //会议模式
      CallinState, //呼入会议
      CallMode, //呼叫方式
      BroadcastMode, //广播模式
      HandType, //手柄类型
      UserType, //坐席类型
      OnDuty, //值班功能
      GroupType, //组类型
      DeviceType, //号码类型
      DeviceState, //号码状态
      YesOrNo, //是否
      UnattendMode, //值班值守模式
      AgentState, //坐席状态
      SmsStatus, //短信状态
      RTCStreamEventType, //RTCSteanm事件类型
      RTSPStreamEventType, //RTSPStream事件类型
      PTZCommond, // 云台控制命令不能为空
      ConnectCode, // 连接状态码
    },
    Log: Logger.prefix("Out"),
    client: null,
  };

  window.Log = sdk.Log;

  Logger.info(
    "DispRTC",
    sdkVersion,
    Browser.checkRequirements() ? "浏览器支持该SDK" : "浏览器不支持该SDK"
  );

  return sdk;
});
