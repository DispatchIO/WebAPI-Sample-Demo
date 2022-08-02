!(function (e, t) {
  'object' == typeof exports && 'undefined' != typeof module
    ? (module.exports = t())
    : 'function' == typeof define && define.amd
    ? define(t)
    : ((e = 'undefined' != typeof globalThis ? globalThis : e || self).DispRTC = t());
})(this, function () {
  'use strict';

  /**
   * http客服端
   */
  var http = null;

  /**
   * 创建http客户端，使用axios
   * @param {String} serverUrl 服务器URL
   */
  const createAxois = (serverUrl) => {
    if (typeof axios === 'undefined') {
      throw new Error('请导入axios依赖');
    }
    const instance = axios.create({
      baseURL: serverUrl,
      // timeout: 10000, //超时时间 10s
    });
    instance.defaults.headers.post['Content-Type'] = 'application/json;';

    // 添加请求拦截器
    instance.interceptors.request.use(
      (config) => {
        const token = DispRTC.client.token || Store.get('token') || '';
        if (config.url !== '/account/sign_in') {
          if (!token) return Promise.reject('用户未登录');
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
        Util.reqLog(response.config, response.data);

        if (response.data.code === 403 || response.data.code === 480) {
          DispRTC.client &&
            DispRTC.client.emit(EventType.LOGIN_STATUS, {
              eventType: EventType.LOGIN_STATUS,
              data: { code: response.data.code, msg: response.data.msg },
            });
          //清空Client客户端
          clearCLient();
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
   * 日志打印
   */
  window.log = (group, ...args) => {
    if (args.length === 0 || DispRTC.options?.debug !== true) return;

    if (args.length > 0) {
      console.group(group);
      if (Util.isCef) {
        args.forEach((e) => {
          try {
            console.info(JSON.stringify(data));
          } catch (error) {
            console.info(data);
          }
        });
      } else {
        args.forEach((e) => console.table(e));
      }
      console.groupEnd();
    } else {
      if (Util.isCef) {
        try {
          console.info(JSON.stringify(group));
        } catch (error) {
          console.info(group);
        }
      } else console.table(group);
    }
  };

  /**
   * 工具类
   */
  class Util {
    static isCef = navigator.userAgent.toLowerCase().includes('mycef');

    /**
     * 请求日志打印
     * @param {Object} config 请求设置
     * @param {Object} repData 请求返回结果
     * @param {Array} ext 拓展打印信息
     * @param {Array} skin 皮肤数组
     * @param {Boolean} showDefSkin 是否显示默认配色
     */
    static reqLog(config, repData, ext = [], skin = [], showDefSkin = true) {
      if (DispRTC.options?.debug !== true) return;

      // 皮肤样式rbg色值
      const defaultSkin = [
        [244, 98, 134],
        [9, 176, 233],
        [171, 146, 212],
        [169, 193, 0],
        [51, 60, 130],
        [252, 169, 127],
        [140, 10, 229],
        [99, 190, 205],
      ];
      const logSkin = skin.length ? skin : defaultSkin;
      // 日志样式
      const logStyle = (color, size) => {
        return [
          `color: rgb(${color.join(',')})`,
          `font-size: ${size}px`,
          `text-shadow: 1px 1px 3px rgba(${color.join(',')}, .6)`,
        ].join(';');
      };
      // 随机生成rgb颜色
      const generateColor = () => {
        return new Array(3).fill(0).map(() => Math.ceil(Math.random() * 255));
      };
      // 打印信息
      let infoGroup = [
        {
          label: '请求接口',
          size: 12,
          content: config.url,
        },
        {
          label: '请求方法',
          size: 12,
          content: config.method.toUpperCase(),
        },
        {
          label: '请求参数',
          size: 12,
          content: config.params || '',
        },
        {
          label: '请求数据',
          size: 12,
          content: config.data || '',
        },
        // {
        //   label: '请求头部',
        //   size: 12,
        //   content: JSON.stringify(config.headers),
        // },
        {
          label: '状态码',
          size: 12,
          content: repData?.code,
        },
        {
          label: '响应消息',
          size: 12,
          content: repData?.msg,
        },
        {
          label: '响应数据',
          size: 12,
          content: repData?.data ? JSON.stringify(repData?.data) : '',
        },
        {
          label: '请求时间',
          size: 12,
          content: new Date().toLocaleString(),
        },
        ...ext,
      ];
      infoGroup = infoGroup.map((item, index) => {
        item.color = showDefSkin
          ? logSkin[index + 1 > logSkin.length ? (index + 1) % logSkin.length : index]
          : generateColor();
        return item;
      });
      console.group(config.url);
      for (const key in infoGroup) {
        const { label, color, size, content } = infoGroup[key];
        if (this.isCef) console.info(`${label}: ${content}`);
        else console.info(`%c${label}: %s`, logStyle(color, size), content);
      }
      console.groupEnd();
    }

    /**
     * Aes 加密
     * @param {String} message 加密内容
     * @param {String} key 秘钥
     * @returns
     */
    static aesEncrypt(message, key = '000000') {
      return CryptoJS.AES.encrypt(message, CryptoJS.enc.Utf8.parse(key), {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
      }).toString();
    }

    /**
     * Aes解密
     * @param {String} message 解密内容
     * @param {String} key 秘钥
     * @returns
     */
    static aesDecrypt(message, key = '000000') {
      return CryptoJS.AES.decrypt(message, key).toString(CryptoJS.enc.Utf8);
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
    static sign(str, key = '') {
      let secretKey = key;
      if (secretKey.length > 16) {
        secretKey = secretKey.substring(secretKey.length - 16);
      }
      while (secretKey.length < 16) {
        secretKey = '0' + secretKey;
      }
      return this.base64Encrypt(str + ':' + this.aesEncrypt(str + '@' + key + '@' + this.parseTime2Str(), secretKey));
    }

    /**
     * 格式化时间为yyyyMMddHHmmss
     * @param {Date} date
     * @returns
     */
    static parseTime2Str(date = new Date()) {
      let year = date.getFullYear();
      let month = date.getMonth() + 1;
      month < 10 && (month = '0' + month);
      let day = date.getDate();
      day < 10 && (day = '0' + day);
      let hour = date.getHours();
      hour < 10 && (hour = '0' + hour);
      let minute = date.getMinutes();
      minute < 10 && (minute = '0' + minute);
      let second = date.getSeconds();
      second < 10 && (second = '0' + second);
      return '' + year + month + day + hour + minute + second;
    }

    /**
     * 判断对象是否为空，包含undefined,'',null, {},[]
     * @param {*} obj
     * @returns
     */
    static isEmpty(obj) {
      if (obj === undefined || obj === null) return true;
      if (typeof obj === 'boolean' || typeof obj === 'number') return false;
      if (typeof obj === 'string') {
        return !obj.trim();
      }
      return Object.keys(obj).length === 0;
    }
  }

  /**
   * 存储类
   */
  class Store {
    /**
     * 存储前缀
     */
    static keyName = 'DispRTC-';

    /**
     * 存储storage
     */
    static set(params = {}) {
      let { name, content, type } = params;
      name = Store.keyName + name;
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
      if (typeof params === 'string') {
        params = { name: params };
      }
      let { name, debug } = params;
      name = Store.keyName + name;
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
      if (obj.dataType == 'string') {
        content = obj.content;
      } else if (obj.dataType == 'number') {
        content = Number(obj.content);
      } else if (obj.dataType == 'boolean') {
        content = eval(obj.content);
      } else if (obj.dataType == 'object') {
        content = obj.content;
      }
      return content;
    }
    /**
     * 删除storage
     */
    static remove(params = {}) {
      if (typeof params === 'string') {
        params = { name: params };
      }
      let { name, type } = params;
      name = Store.keyName + name;
      if (type) {
        window.localStorage.removeItem(name);
      } else {
        window.sessionStorage.removeItem(name);
      }
    }

    /**
     * 清空全部localStorage
     */
    static clear(params = {}) {
      if (typeof params === 'string') {
        params = { type: params };
      }
      let { type } = params;
      if (type) {
        window.localStorage.clear();
      } else {
        window.sessionStorage.clear();
      }
    }
  }

  /**
   * 事件集合
   *
   */
  const EventType = {
    /**
     * ALL表示订阅所有事件，只是用来派发事件，实际上不存在该事件
     */
    ALL: 'All',

    /**
     * 结果事件
     */
    RESULT_MAKE_CALL: 'Result_MakeCall', //单呼结果事件
    RESULT_ADVANCE_CALL: 'Result_AdvanceCall', //强呼结果事件
    RESULT_ROLL_CALL: 'Result_RollCall', //点名结果事件
    RESULT_POLL_CALL: 'Result_PollCall', //轮询结果事件
    RESULT_GROUP_CALL: 'Result_GroupCall', //组呼结果事件
    RESULT_SELECT_CALL: 'Result_SelectCall', //选呼结果事件
    RESULT_BROADCAST_CALL: 'Result_BroadcastCall', //广播结果事件
    RESULT_SINGLE_TRANSFER_CALL: 'Result_SingleTransferCall', //呼叫转移结果事件
    RESULT_CONSULT_CALL: 'Result_ConsultCall', //咨询呼叫结果事件
    RESULT_TRANSFER_CALL: 'Result_TransferCall', //咨询转接结果事件
    RESULT_ANSWER_CALL: 'Result_AnswerCall', //应答结果事件
    RESULT_GROUP_ANSWER_CALL: 'Result_GroupAnswerCall', //群答结果事件
    RESULT_JOIN_MEET_CALL: 'Result_JoinMeetCall', //加入会议结果事件
    RESULT_FORCE_INSERT_CALL: 'Result_ForceInsertCall', //加入会议结果事件
    RESULT_FORCE_RELEASE_CALL: 'Result_ForceReleaseCall', //强拆结果事件
    RESULT_FORCE_CLEAR_CALL: 'Result_ForceClearCall', //强断结果事件
    RESULT_MONITOR_CALL: 'Result_MonitorCall', //监听结果事件
    RESULT_CLEAR_CONNECTION: 'Result_ClearConnection', //挂断结果事件

    /**
     * 状态事件
     */
    LOGIN_STATUS: 'LoginStatus', //登录状态事件
    AGENT_STATUS_EVENT: 'AgentStatusEvent', //座席状态事件
    AGENT_OFFLINE_EVENT: 'AgentOfflineEvent', //座席下线事件
    CALL_CONN_STATUS_EVENT: 'CallConnStatusEvent', //用户状态事件
    MEET_STATUS_EVENT_ADD: 'MeetStatusEvent_Add', //会议信息事件-新增
    MEET_STATUS_EVENT_MOD: 'MeetStatusEvent_Mod', //会议信息事件-修改
    MEET_STATUS_EVENT_DEL: 'MeetStatusEvent_Del', //会议信息事件-删除
    MEET_MEMBER_EVENT_ADD: 'MeetMemberEvent_Add', //会议成员事件-新增
    MEET_MEMBER_EVENT_DEL: 'MeetMemberEvent_Del', //会议成员事件-删除
    MEET_ASK_SPEAK_EVENT: 'MeetAskSpeakEvent', //举手发言事件
    CALL_QUEUE_STATUS_EVENT: 'CallQueueStatusEvent', //用户呼入事件
    VIDEO_DISPENSE_EVENT: 'VideoDispenseEvent', //视频分发事件
    VIDEO_STATUS_EVENT: 'VideoStatusEvent', //视频实时状态事件
    SMS_DATA_EVENT_STATUS: 'SmsDataEvent_Status', //短信状态事件事件
    SMS_DATA_EVENT_NEW: 'SmsDataEvent_New', //新短信事件
    SMS_GROUP_EVENT_ADD: 'SmsGroupEvent_Add', //群组信息事件-新增
    SMS_GROUP_EVENT_MOD: 'SmsGroupEvent_Mod', //群组信息事件-修改
    SMS_GROUP_EVENT_DEL: 'SmsGroupEvent_Del', //群组信息事件-删除
    SMS_GROUP_EVENT_CONTACTADD: 'SmsGroupEvent_ContactAdd', //群组信息事件-添加人员
    SMS_GROUP_EVENT_CONTACTDEL: 'SmsGroupEvent_ContactDel', //群组信息事件-删除人员
    FAX_DATA_EVENT_STATUS: 'FaxDataEvent_Status', //传真状态事件
    FAX_DATA_EVENT_NEW: 'FaxDataEvent_New', //新传真事件
    FAX_DATA_EVENT_DEL: 'FaxDataEvent_Del', //传真删除事件
    FAX_DATA_EVENT_READ: 'FaxDataEvent_Read', //传真已读事件
    LOCATION_NOTIFY_EVENT: 'LocationNotifyEvent', //实时定位上报事件

    /**
     * 数据事件
     */
    GROUP_EVENT_ADD: 'GroupEvent_Add', //部门事件-新增
    GROUP_EVENT_MOD: 'GroupEvent_Mod', //部门事件-修改
    GROUP_EVENT_DEL: 'GroupEvent_Del', //部门事件-删除
    OPERATOR_EVENT_ADD: 'OperatorEvent_Add', //调度员事件-新增
    OPERATOR_EVENT_MOD: 'OperatorEvent_Mod', //调度员事件-修改
    OPERATOR_EVENT_DEL: 'OperatorEvent_Del', //调度员事件-删除
    EMPLOYEE_EVENT_ADD: 'EmployeeEvent_Add', //职员事件-新增
    EMPLOYEE_EVENT_MOD: 'EmployeeEvent_Mod', //职员事件-修改
    EMPLOYEE_EVENT_DEL: 'EmployeeEvent_Del', //职员事件-删除
    VIDEO_GROUP_EVENT_ADD: 'VideoGroupEvent_Add', //监控分组事件-新增
    VIDEO_GROUP_EVENT_MOD: 'VideoGroupEvent_Mod', //监控分组事件-修改
    VIDEO_GROUP_EVENT_DEL: 'VideoGroupEvent_Del', //监控分组事件-删除
    VIDEO_INFO_EVENT_ADD: 'VideoInfoEvent_Add', //监控节点事件-新增
    VIDEO_INFO_EVENT_MOD: 'VideoGroupEvent_Mod', //监控节点事件-修改
    VIDEO_INFO_EVENT_DEL: 'VideoGroupEvent_Del', //监控节点事件-删除

    /**
     * RTCStream事件
     */
    RTC_STREAM_SESSION_EVENT: 'rtcStreamSessionEvent', //rtcStream session事件
  };

  /**
   * 数据操作类型
   */
  const DataAction = {
    ACTION_ADD: 'add', //新增
    ACTION_UPDATE: 'update', //修改
    ACTION_DELETE: 'delete', //删除
    ACTION_SET: 'set', //设置
    ACTION_GET: 'get', //查询
    ACTION_LIST: 'list', //查询列表
    ACTION_LISTID: 'listid', //查询id列表
    ACTION_LISTSUB: 'listsub', //查询子列表
  };

  /**
   * 双工模式
   *
   */
  const DuplexMode = {
    FULL: 'full', //全双工
    HALF: 'hakf', //半双工
  };

  /**
   * 呼叫类型
   *
   */
  const CallType = {
    AUDIO: 'audio', //语音
    VIDEO: 'video', //视频
  };

  /**
   * 会议类型
   */
  const MeetMode = {
    VIDEO: 'video', //视频
    AUDIO: 'audio', //语音
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
    SERIAL: 'serial', //顺序呼叫
    PARALLEL: 'parallel', //同时呼叫
  };

  /**
   * 广播模式
   *
   */
  const BroadcastMode = {
    MANUAL: 'manual', //人工语音
    FILE: 'file', //语音文件
    TTS: 'tts', //文本文字
  };

  /**
   * 手柄类型
   *
   */
  const HandType = {
    PHONE: 'phone', //话机
    HAND_MICROPHONE: 'hand_microphone', //手咪
  };

  /**
   * 坐席类型
   *
   */
  const UserType = {
    OPERATOR: 'operator', //普通坐席
    MONITOR: 'monitor', //班长坐席
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
    ORGAN: 'organ', //普通组
    DISPATCH_GROUP: 'dispatchgroup', //调度组
  };

  /**
   * 号码类型
   */
  const DeviceType = {
    OFFICE: 'office', //办公号码
    HOME: 'home', //家庭号码
    MOBILE: 'mobile', //手机号码
    FAX: 'fax', //传真号码
    LINKAGE: 'linkage', //联动号码
    WIRELESS: 'wireless', //无线终端
    POCGROUP: 'pocgroup', //集群群组
    POC: 'poc', //集群号码
    SOLDIER: 'soldier', //单兵终端
    VIDEO: 'video', //视频终端
  };

  /**
   * 号码状态
   *
   */
  const DeviceState = {
    IDLE: 'idle', // 空闲
    READY: 'ready', // 准备呼出
    RING: 'ring', // 振铃
    TALK: 'talk', // 通话
    HOLD: 'hold', // 保持
    QUEUE: 'queue', // 排队
    CALL_FAIL: 'callfail', // 呼叫失败
    BROADCAST: 'broadcast', // 呼叫广播
    ALLOW_SPEAK: 'allowspeak', // 允许发言
    BAN_SPEAK: 'banspeak', // 禁止发言
    SINGLE_TALK: 'singletalk', // 单独通话
    OFFLINE: 'offline', // 离线
    MONITOR_RING: 'monitoring', // 监测振铃
    MONITOR_TALK: 'monitortalk', // 监测通话
  };

  /**
   * 是否
   */
  const YesOrNo = {
    YES: 'yes',
    NO: 'no',
  };

  /**
   * 值班值守模式
   */
  const UnattendMode = {
    OPEN: 'open',
    CLOSE: 'close',
  };
  /**
   * 坐席状态
   */
  const AgentState = {
    LOGOUT: 'logout', //登出
    LOGIN: 'login', //已登录（开班状态）
    WORKING_AFTER_CALL: 'workingaftercall', //无人值守
    STOP: 'stop', //关班
  };

  /**
   * SDK顶级类
   */
  class DispRTC {
    /**
     * 版本号
     */
    static version = '1.0.0';

    /**
     * 客户端，只有一个客户端, 新建后会覆盖
     */
    static client = null;

    static options = {};

    static EventType = EventType; //事件集合枚举
    static DataAction = DataAction; //数据操作动作
    static GroupType = GroupType; //组类型
    static DeviceState = DeviceState; //号码状态
    static CallType = CallType; //呼叫类型
    static DuplexMode = DuplexMode; //双工模式
    static CallMode = CallMode; //呼叫方式
    static HandType = HandType; //手柄类型
    static DeviceType = DeviceType; //号码类型
    static BroadcastMode = BroadcastMode; //广播模式
    static UnattendMode = UnattendMode; //值班值守模式
    static AgentState = AgentState; //坐席状态
    static UserType = UserType; //坐席类型
    static OnDuty = OnDuty; //值班功能
    static MeetMode = MeetMode; //会议模式
    static CallinState = CallinState; //呼入会议

    /**
     * 创建客户端
     * @param {Object} options
     * {
     *    server:'', //服务器url
     *    token: '', //登录后的token，用于刷新页面创建Client, 与用户名密码二选一
     *    debug: false, //是否开启日志 默认false不开启
     * }
     *
     * @returns
     */
    static createClient(options = {}) {
      if (options.proxy) {
        options.server = location.origin;
        http = createAxois(options.server + '/v2');
        // options.server = server;
      } else {
        if (!options.server) {
          throw new Error('服务器地址不能为空');
        }
        if (!options.server.startsWith('http:') && !options.server.startsWith('https:')) {
          throw new Error('请输入正确的服务器地址，以http:或https:开头');
        }
        http = createAxois(options.server + '/v2');
      }

      if (!DispRTC.Browser.checkRequirements()) {
        // throw new Error('浏览器不支持该SDK'); //TODO https部署
        console.warn('浏览器不支持该SDK');
      }

      // if (!options.proxyV2) {
      //   options.server = location.origin; //TODO
      // }

      this.options = options;

      this.client = new DispRTC.Client(options);

      if (!Util.isEmpty(options.token)) Store.set({ name: 'token', content: options.token });

      this.client.initData();
      return this.client;
    }

    /**
     * 创建createRTSPtream
     * @param {Object} options
     *
     * @returns
     */
    static createRTSPStream(options = {}) {
      if (!options.server) {
        if (this.client) options.server = this.client.server;
        else {
          throw new Error('服务器地址不能为空');
        }
      }
      return new DispRTC.RTSPStream(options);
    }

    /**
     * 获取RTCtream
     *
     * @returns
     */
    static getRTCStream(name) {
      return name ? DispRTC.RTCStream.getInstanceByName(name) : DispRTC.RTCStream.getInstances();
    }

    /**
     * 销毁Client客户端
     */
    static async destroy() {
      DispRTC.Client.wsClient && DispRTC.Client.wsClient.close();
      if (this.client && this.client.token) {
        try {
          await this.client.logout();
        } catch (error) {}
        this.client.operatorInfo = null;
        this.client.token = '';
        Timer.clearTimer();
      }
      DispRTC.RTCStream.destroy();
      Store.clear();
    }
  }

  /**
   * 清空客服端数据
   */
  const clearCLient = () => {
    DispRTC.Client.wsClient && DispRTC.Client.wsClient.close();
    DispRTC.client.operatorInfo = null;
    DispRTC.client.token = '';
    Timer.clearTimer();
    DispRTC.RTCStream.destroy();
    Store.clear();
  };

  DispRTC.Browser = class {
    constructor() {}

    /**
     * 检查Web SDK对正在使用的浏览器的适配情况
     * @returns Boolean true支持 false不支持
     */
    static checkRequirements() {
      try {
        let flag = !!(
          (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ||
          navigator.getUserMedia ||
          navigator.webkitGetUserMedia ||
          navigator.mozGetUserMedia
        );
        if (!flag) {
          return false;
        }
        return this.checkSupportWebsocket();
      } catch (e) {
        return false;
      }
    }

    /**
     * 是否支持Websocket
     */
    static checkSupportWebsocket() {
      try {
        return !!window.WebSocket;
      } catch (e) {
        return false;
      }
    }
  };

  /**
   * websocket客户端
   */
  class WsClient {
    constructor(token, client) {
      this.token = token;
      this.client = client;
      this.ws = null;
    }

    connection() {
      if (!DispRTC.client || this.client !== DispRTC.client) {
        console.warn('Client还未创建，或者已改变，不进行Websocket连接');
        return null;
      }
      if (typeof io === 'undefined') {
        console.warn('请导入socket.io依赖');
        client.emit('SOCKET_IO_LACK', {
          eventType: 'SOCKET_IO_LACK',
          data: '缺少socket.io依赖',
        });
        return null;
      }
      let ws = (this.ws = io(DispRTC.client.server, {
        transports: ['websocket'],
        path: '/socket.io',
        query: {
          token: this.token,
        },
      }));
      ws.on('connect', (data) => {
        console.log('socket connect状态', ws.connected ? '成功' : '失败', data);
      });

      ws.on('error', (error) => {
        console.log('socket error', error);
      });

      ws.on('connect_error', (error) => {
        console.log('socket connect_error', error);
      });

      ws.on('message', (data) => {
        console.log('socket message', data);
      });

      //接收上报事件
      ws.on(this.token, (data) => {
        // console.log('socket token', JSON.stringify(data));
        if (DispRTC.client && DispRTC.client === this.client) {
          this.handleMsg(data);
          this.client.emit(data.eventType, data);
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
        case EventType.CALL_CONN_STATUS_EVENT:
          this.handleDeviceStatus(data);
          break;
        case EventType.OPERATOR_EVENT_MOD:
          // if (
          //   this.client.operatorInfo &&
          //   data.data.operatorID === this.client.operatorInfo.operatorID
          // ) {
          //   await this.client.getOperatorInfo(true, true);
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
        clearCLient();
      }
    }

    handleDeviceStatus(data) {
      data = data.data;
      let { mainTel, viceTel } = this.client.operatorInfo;
      // console.warn('handleDeviceStatus', data, this.client.telStatus);
      if (!Util.isEmpty(data.localDevice) && (data.localDevice === mainTel || data.localDevice === viceTel)) {
        this.client.telStatus[data.localDevice] = data.localState;
      }
    }

    close() {
      this.ws && (this.ws.close(), (this.ws = null));
    }
  }

  /**
   * 客户端
   * 用于连接后台以及所有操作
   */
  DispRTC.Client = class {
    //websocket连接
    static wsClient = null;

    constructor(options) {
      this.proxy = options.proxy || false;
      this.server = options.server;
      this.softPhoneServer = this.server.startsWith('http:')
        ? this.server.replace('http:', 'ws:')
        : this.server.replace('https:', 'wss:');
      this.token = options.token; //登录后token
      this.debug = options.debug || false; //是否开启日志 默认false不开启
      this.username = options.username; //用户名
      this.password = options.password; //密码
      this.operatorInfo = null; //操作员信息
      this.telStatus = {}; //操作员号码状态
      this.callSession = new CallSessions(this);
      this.videoSession = new VideoSessions(this);
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
            !this.eventMap[property].some((f) => f == fn) && this.eventMap[property].push(fn);
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
            !this.onceEventMap[property].some((f) => f == fn) && this.onceEventMap[property].push(fn);
            return true;
          },
        }
      );

      //绑定事件
      options.ons && options.ons.forEach((e) => this.on(e.name, e.fn));
    }

    /**
     * 绑定事件
     * @param {String} name 事件名称,为后台上报的事件名称
     * @param {Function} fn 回调函数
     */ å;
    on(name, fn) {
      //只有事件名称存在才绑定
      if (name && Object.values(EventType).includes(name) && typeof fn === 'function') {
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
      if (name && name !== EventType.ALL && Object.values(EventType).includes(name) && typeof fn === 'function') {
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
    }

    /**
     * 是否已登录
     * @returns
     */
    isLogin() {
      if (Store.get('token')) return true;
      return false;
    }

    /**
     * 初始化数据
     * @returns
     */
    initData() {
      if (!this.isLogin()) {
        return;
      }
      this.token = Store.get('token');
      //获取用户信息
      this.getOperatorInfo(true);
      //获取系统默认会议
      this.conferenceRoom.initData();
      //开启websocket
      this.server && (DispRTC.Client.wsClient = new WsClient(this.token, this).connection());
      //保活
      Timer.keepalive(this);
    }

    /**
     * 登录
     * @param {String} username 用户名
     * @param {String} password 密码
     * @returns
     */
    login(username, password) {
      return new Promise((resolve, reject) => {
        if (!username || !password) {
          return reject('用户名或密码不能为空');
        }
        //加密
        if (typeof CryptoJS === 'undefined') {
          return reject('请导入CryptoJS依赖');
        }

        let form = {
          user_name: username,
          signature: Util.sign(username, password),
        };

        Api.User.login(form)
          .then((res) => {
            this.token = res.data.access_token;
            Store.set({ name: 'token', content: this.token });
            this.initData();
            resolve(res);
          })
          .catch((err) => {
            console.log('登录失败', err);
            reject(err);
          });
      });
    }

    /**
     * 获取用户详细信息
     */
    getOperatorInfo(initData = false, refresh = false) {
      return new Promise((resolve, reject) => {
        if (!refresh && this.operatorInfo) {
          resolve(R.ok(this.operatorInfo));
          return;
        }
        Api.User.getUserInfo()
          .then((res) => {
            this.operatorInfo = res.data.list[0];
            resolve(R.ok(this.operatorInfo));
            if (!initData) return;
            //处理用户号码状态
            let { mainTel, viceTel } = this.operatorInfo;

            this.initSoftPhone();

            this.telStatus = {};
            mainTel &&
              this.callSession.getCallConnStatus(mainTel).then((res) => {
                this.telStatus[mainTel] = res.data.localState;
              });
            viceTel &&
              this.callSession.getCallConnStatus(viceTel).then((res) => {
                this.telStatus[viceTel] = res.data.localState;
              });
          })
          .catch((err) => {
            reject(err);
          });
      });
    }

    initSoftPhone() {
      //处理用户号码状态
      let { mainTel, viceTel, operatorID, mainTelType, viceTelType } = this.operatorInfo;
      //获取软电话配置
      let olds = DispRTC.RTCStream.getInstances();
      olds.forEach((e) => {
        if (e.phone !== mainTel && e.phone !== viceTel) {
          e.unRegister();
        }
      });
      Api.Data.SoftPhone.list({ operatorID })
        .then((res) => {
          // console.log('软电话配置', res.data.list);
          let softs = res.data.list;
          softs.forEach((e) => {
            if (e.phone !== mainTel && e.phone !== viceTel) {
              Api.Data.SoftPhone.delete(e.ID)
                .then((res) => {})
                .catch((err) => {});
            } else if (e.enabled === 1) {
              this.softPhoneRegister(
                {
                  phone: e.phone,
                  password: e.password,
                  wsServer: this.softPhoneServer,
                  phoneType: e.phone === mainTel ? mainTelType : viceTelType,
                },
                e.phone === this.operatorInfo.mainTel ? 'main' : 'vice'
              );
            }
          });
        })
        .catch((err) => {
          console.log('软电话配置init失败');
        });
    }

    listSoftPhoneConfig() {
      return new Promise((resolve, reject) => {
        Api.Data.SoftPhone.list({ operatorID: this.operatorInfo.operatorID })
          .then((res) => {
            let list = [];
            res.data.list.forEach((e) => {
              if (e.phone === this.operatorInfo.mainTel) {
                list.push({
                  ID: e.ID,
                  phone: e.phone,
                  enabled: 1,
                  password: e.password,
                  operatorID: e.operatorID,
                  telType: 'main',
                });
              } else if (e.phone === this.operatorInfo.viceTel) {
                list.push({
                  ID: e.ID,
                  phone: e.phone,
                  enabled: 1,
                  password: e.password,
                  operatorID: e.operatorID,
                  telType: 'vice',
                });
              }
            });
            res.data.list = list;

            resolve(res);
          })
          .catch((err) => {
            reject(err);
          });
      });
    }

    setSoftPhoneConfig(list) {
      return new Promise(async (resolve, reject) => {
        if (!list || list.length === 0) {
          return reject(R.err('没有要修改的信息'));
        }
        for (let i = 0; i < list.length; i++) {
          let e = list[i];
          if (e.ID) {
            let update = {
              ID: e.ID,
              operatorID: e.operatorID,
              phone: e.phone,
              password: e.password,
              enabled: e.enabled,
              phoneType: 'phone',
            };
            await Api.Data.SoftPhone.edit(update)
              .then((res) => {
                if (e.enabled === 1) {
                  this.softPhoneRegister(
                    {
                      phone: e.phone,
                      password: e.password,
                      wsServer: this.softPhoneServer,
                      phoneType: this.operatorInfo.mainTelType,
                    },
                    e.phone === this.operatorInfo.mainTel ? 'main' : 'vice'
                  );
                } else {
                  let old = DispRTC.RTCStream.instances.get(e.phone);
                  if (old) old.unRegister();
                }
              })
              .catch((err) => {
                console.log('修改软电话信息失败', err);
                return reject(err);
              });
          } else {
            let add = {
              operatorID: e.operatorID,
              phone: e.phone,
              password: e.password,
              enabled: e.enabled,
              phoneType: 'phone',
            };
            await Api.Data.SoftPhone.add(add)
              .then((res) => {
                if (e.enabled === 1) {
                  this.softPhoneRegister(
                    {
                      phone: e.phone,
                      password: e.password,
                      wsServer: this.softPhoneServer,
                      phoneType: this.operatorInfo.mainTelType,
                    },
                    e.phone === this.operatorInfo.mainTel ? 'main' : 'vice'
                  );
                } else {
                  let old = DispRTC.RTCStream.instances.get(e.phone);
                  if (old) old.unRegister();
                }
              })
              .catch((err) => {
                console.log('添加软电话信息失败', err);
                return reject(err);
              });
          }
        }

        resolve(R.ok());
      });
    }

    /**
     * 设置个人信息，用于修改自己的信息
     */
    setProfile(data) {
      if (!data.operatorID || data.operatorID !== this.operatorInfo.operatorID) {
        return Promise.reject(R.err('只能修改本人信息'));
      }
      let { mainTel, viceTel } = data;
      if (!mainTel && !viceTel) {
        return Promise.reject(R.err('请至少填写一个手柄号码'));
      }
      return new Promise(async (resolve, reject) => {
        Api.Data.Operator.edit(data)
          .then(async (res) => {
            this.getOperatorInfo(true, true);
            resolve(res);
          })
          .catch((err) => {
            console.log('修改个人信息失败', err);
            reject(err);
          });
      });
    }

    /**
     * 获取手柄类型 左/右
     * @param {String} callingDevice
     */
    getHandleType(callingDevice) {
      if (this.operatorInfo.viceTel === callingDevice) return 'main';
      return 'main';
    }

    /**
     * 软电话注册
     * @param {Object} config
     * @returns
     */
    softPhoneRegister(config, handleType) {
      let old = DispRTC.RTCStream.instances.get(config.phone);
      if (old) {
        old.handleType = handleType;
        return;
      }
      // 创建对象
      let rtcStream = new DispRTC.RTCStream({
        phone: config.phone,
        password: config.password,
        wsServer: config.wsServer,
        phoneType: config.phoneType,
        handleType: handleType,
        client: this,
      });
      // 初始化并注册
      rtcStream.init();
    }

    /**
     * 获取模块信息
     * @returns
     */
    getModules() {
      return Api.Data.Module.list();
    }

    /**
     * 登出
     * @returns
     */
    logout() {
      return Api.User.logout();
    }

    /**
     * 闭铃
     * @returns
     */
    suspendRing() {
      return Api.User.suspendRing();
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
     * 获取操作员坐席状态
     * @returns
     */
    listAgentStatus(data) {
      return Api.User.listAgentStatus(data);
    }
    /**
     * 值班值守
     * @returns
     */
    setUnattend(calledDevice, mode = UnattendMode.OPEN) {
      if (Util.isEmpty(calledDevice)) return Promise.reject(R.err('值班值守号码不能为空'));
      return Api.User.setUnattend({ calledDevice, mode });
    }
  };

  /**
   * 构造返回结果类
   * 统一返回{code:200,data:{},msg:'success'}
   */
  class R {
    /**
     * 返回成功消息
     * @param {any} data 数据
     * @returns
     */
    static ok(data) {
      return { code: 200, data, msg: 'success' };
    }

    /**
     * 返回错误消息
     * @param {String} msg 错误消息
     * @param {Int} code 状态码
     * @returns
     */
    static err(msg, code = 0) {
      return { code: code, msg };
    }
  }

  const RTCStreamEventType = {
    STARTING: 'starting',
    STARTED: 'started',
    CONNECTING: 'connecting',

    LOGIN: 'login',
    CALLING: 'calling',
    MAKE_CALL: 'make_call',
    RING: 'ring',
    ANSWER: 'answer',
    HANGUP: 'hangup',
    LOGOUT: 'logout',
    DTMF: 'dtmf',
    PTT_REQUEST: 'ptt_request',
    PTT_RELEASE: 'ptt_release',
    HEART: 'heart',

    ON_NEW_CALL: 'on_new_call',
    ON_RING: 'on_ring',
    ON_RING_183: 'on_ring_183',
    ON_ANSWER: 'on_answer',
    ON_HANGUP: 'on_hangup',
    ON_PTT_REQUEST: 'on_ptt_request',
    ON_PTT_RELEASE: 'on_ptt_release',

    ON_DISCONNECT: 'on_disconnect',
  };

  const CALL_DIRECTION = {
    IN: 0,
    OUT: 1,
  };
  const CALL_TYPE = {
    AUDIO: 'call-audio',
    VIDEO: 'call-audiovideo',
    HALF_AUDIO: 'call-halfaudio',
  };

  /**
   * 软电话
   */
  DispRTC.RTCStream = class {
    static instances = new Map(); // 已实例化的对象
    static audioRemote; // 远程语音
    static isInited = false; // 是否初始化
    static webrtc2SipEnabled = false; // 是否启用
    static EventType = RTCStreamEventType;

    // 获取已实例化的Webrtc2Sip对象
    static getInstances() {
      return [...this.instances.values()];
    }

    // 获取已实例化的Webrtc2Sip对象
    static getInstanceByName(name) {
      return this.instances.get(name);
    }

    // 销毁Webrtc2Sip所有实例
    static destroy() {
      if (!this.instances) return;
      for (const item of this.instances.values()) {
        item.unRegister();
      }
    }

    /**
     * 构造函数
     * @param {*} containers
     * @param {*} sessionEvent
     */
    constructor(options) {
      DispRTC.RTCStream.client = options.client;

      this.client = options.client;
      this.handleType = options.handleType; //手柄类型，左右手柄
      this.phone = options.phone || null; //号码
      this.password = options.password || null; //密码
      this.wsServer = options.wsServer; //websocket服务器
      this.iceServers = null;
      this.frameRate = 30;
      this.resolution = 1280;
      this.videoFrameRate = 30;
      this.videoResolution = 1280;
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

      // 容器集合
      this.videoLocalMap = new Map();
      this.videoRemoteMap = new Map();

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
            !this.eventMap[property].some((f) => f == fn) && this.eventMap[property].push(fn);
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
            !this.onceEventMap[property].some((f) => f == fn) && this.onceEventMap[property].push(fn);
            return true;
          },
        }
      );
    }

    /**
     * 绑定事件
     * @param {String} name 事件名称
     * @param {Function} fn 回调函数
     */
    on(name, fn) {
      if (name && typeof fn === 'function') {
        console.log('RTCStream订阅事件', name, fn);
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
      this.eventMap[name] &&
        this.eventMap[name].forEach((fn) => {
          fn(val, this);
        });
      //派发给客户端ALL事件
      this.client.eventMap[EventType.ALL] &&
        this.client.eventMap[EventType.ALL].forEach((fn) => {
          fn({
            eventType: EventType.RTC_STREAM_SESSION_EVENT,
            data: { event: val, rtcStream: this },
          });
        });
    }

    /**
     * 设置本地注册账号信息
     *
     * @param {String} phone 号码
     * @param {String} password 密码
     */
    setRegisterProfile(phone, password) {
      if (Util.isEmpty(phone) || Util.isEmpty(password)) {
        return Promise.reject(R.err('号码或密码为空'));
      }
      this.phone = phone;
      this.password = password;
      return Promise.resolve(R.ok());
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
          return Promise.reject(R.err('帧率只能是正整数'));
        }
        this.frameRate = frameRate;
      }
      if (resolution) {
        if (!Number.isInteger(resolution) || resolution < 1) {
          return Promise.reject(R.err('分辨率只能是正整数'));
        }
        this.resolution = resolution;
      }
      return Promise.resolve(R.ok());
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
          return Promise.reject(R.err('帧率只能是正整数'));
        }
        this.videoFrameRate = frameRate;
      }
      if (resolution) {
        if (!Number.isInteger(resolution) || resolution < 1) {
          return Promise.reject(R.err('分辨率只能是正整数'));
        }
        this.videoResolution = resolution;
      }
      return Promise.resolve(R.ok());
    }

    /**
     * 初始化本地音视频对象，并且向服务器去注册
     *
     * @param {Fuction} sessionEvent 会话回调事件
     * @param {Fuction} stackEvent sip栈回调事件
     * @param {String} debugLevel sip console日志等级
     */
    init(sessionEvent, stackEvent, options) {
      if (!DispRTC.RTCStream.audioRemote) {
        var audio = new Audio();
        audio.controls = false; //不显示控件按钮
        document.body.appendChild(audio); //把它添加到页面中
        DispRTC.RTCStream.audioRemote = audio;
      }

      if (Util.isEmpty(this.phone) || Util.isEmpty(this.password)) {
        return Promise.reject(R.err('号码或密码为空'));
      }
      this.register()
        .then((res) => {
          this.isInited = true;
        })
        .catch((err) => {
          this.isInited = false;
          return Promise.reject(err);
        });
    }

    /**
     * 注册
     * @param {Object} options
     */
    register() {
      try {
        if (Util.isEmpty(this.phone) || Util.isEmpty(this.password)) {
          return Promise.reject(R.err('号码或密码为空，注册失败'));
        }
        this.iceservers = this.iceServers ? this.iceServers.split(',') : [];

        if (this.iceservers.length > 0) {
          this.iceservers.forEach((item, index, array) => {
            array[index] = 'stun:' + item;
          });
        }

        if (this.webrtcStackNode != null) {
          this.webrtcStackNode.exit();
        }

        this.webrtcStackNode = new DispRTC.RTCStream.WebrtcStack(
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
        DispRTC.RTCStream.instances.set(this.phone, this);
        DispRTC.RTCStream.webrtc2SipEnabled = true;
        this.name = this.phone; // webrtc2sip名称，用号码表示
        return Promise.resolve(R.ok());
      } catch (e) {
        console.log('软电话注册失败 err', e);
        this.unRegister();
        this.webrtcStackNode = null;
        console.warn(`软电话:${this.name}注册失败`);
        return Promise.reject(R.err('软电话注册失败'));
      }
    }

    unRegister() {
      DispRTC.RTCStream.instances.delete(this.name);
      if (this.webrtcStackNode == null) {
        return;
      }
      this.webrtcStackNode.exit();
    }

    /**
     * 呼出
     * @param callType
     * @param phoneNumber
     * @returns {boolean}
     */
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
        this.callType = 'audio';
        remote = DispRTC.RTCStream.audioRemote;
      } else if (callType === CALL_TYPE.HALF_AUDIO) {
        hasHalf = true;
        this.callType = 'half/audio';
        remote = DispRTC.RTCStream.audioRemote;
      } else if (callType === CALL_TYPE.VIDEO) {
        this.callType = 'audio/video';
        hasVideo = true;
        remote = DispRTC.RTCStream.videoRemote;
        local = DispRTC.RTCStream.videoLocal;
      } else {
        return false;
      }
      this.sessionEventFun({
        type: RTCStreamEventType.CALLING,
        description: 'Call in progress...',
      });
      this.webrtcStackNode.call(phoneNumber, local, remote, hasVideo, hasHalf);
      return true;
    }

    sipHangUp() {
      if (this.webrtcStackNode == null) {
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
      if (e == 'after') {
        config = {
          audio: { echoCancellation: true, noiseSuppression: true },
          video: {
            facingMode: { exact: 'environment' },
            advanced: [{ height: 720, width: 1280 }],
          },
        };
      } else if (e == 'before') {
        config = {
          audio: { echoCancellation: true, noiseSuppression: true },
          video: {
            advanced: [{ facingMode: { exact: 'user' }, height: 720, width: 1280 }],
          },
        };
      }
      navigator.mediaDevices
        .getUserMedia(config)
        .then(function (stream) {
          let videoTrack = stream.getVideoTracks()[0];
          let audioTrack = stream.getAudioTracks()[0];

          var sender = self.webrtcStackNode.PC.getSenders().find((s) => s.track.kind == videoTrack.kind);
          var sender2 = self.webrtcStackNode.PC.getSenders().find((s) => s.track.kind == audioTrack.kind);

          sender.replaceTrack(videoTrack);
          sender2.replaceTrack(audioTrack);

          self.webrtcStackNode.localStream = stream;

          self.webrtcStackNode.localElement.srcObject = stream;
          self.webrtcStackNode.localElement.muted = false;

          self.webrtcStackNode.localElement.play();
        })
        .catch(function (err) {});
    }

    /**
     * 呼入接听
     * @param videoRemote
     * @param videoLocal
     * @param mudle
     * @returns {boolean}
     */
    sipAnswer(videoRemote, videoLocal, mudle) {
      if (this.webrtcStackNode == null) {
        return false;
      }

      if (this.callType === 'audio/video') {
        videoLocal = videoLocal instanceof HTMLElement ? videoLocal : document.getElementById(videoLocal);
        videoRemote = videoRemote instanceof HTMLElement ? videoRemote : document.getElementById(videoRemote);
        if (mudle) {
          this.videoLocalMap.set(mudle, videoLocal);
          this.videoRemoteMap.set(mudle, videoRemote);
        }
        this.webrtcStackNode.answer(
          videoLocal || this.videoLocal,
          videoRemote || this.videoRemote || DispRTC.RTCStream.audioRemote
        );
      } else {
        this.webrtcStackNode.answer(null, DispRTC.RTCStream.audioRemote);
      }
      this.sessionEventFun({
        type: RTCStreamEventType.ON_ANSWER,
        description: 'In Call',
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

    /**
     * 播放video
     */
    playVideo(mudle) {
      try {
        if (mudle) {
          this.videoLocalMap.get(mudle) && this.videoLocalMap.get(mudle).play();
          this.videoRemoteMap.get(mudle) && this.videoRemoteMap.get(mudle).play();
        } else {
          this.videoLocal && this.videoLocal.play();
          this.videoRemote && this.videoRemote.play();
        }
      } catch (error) {
        console.log('playVideo', error);
      }
    }

    getCallType() {
      return this.callType;
    }

    getCallName() {
      return this.called ? this.called : '未知';
    }

    getRequestName() {
      return this.requestTel ? this.requestTel : '未知';
    }

    sessionEventFun(event) {
      console.error('-------sessionEventFun--------', JSON.stringify(event));
      if (this.client && this.client.isLogin()) this.emit(event.type, event);
    }

    webrtcstackCallback(msg) {
      switch (msg.type) {
        case RTCStreamEventType.LOGIN:
          if (msg.result === false) {
            this.loginFail = true;
          }
          break;
        case RTCStreamEventType.ON_HANGUP:
          this.clearVideoDom();
          break;
        case RTCStreamEventType.ON_NEW_CALL:
          this.called = msg.from;
          if (msg.isvideo) {
            this.callType = 'audio/video';
          } else if (msg.ishalf) {
            this.callType = 'half/audio';
          } else {
            this.callType = 'audio';
          }
          break;
        case RTCStreamEventType.ON_PTT_REQUEST:
          this.requestTel = msg.tel;
          break;
        case RTCStreamEventType.ON_DISCONNECT:
          this.unRegister();
          console.warn('ON_DISCONNECT', this.name, this.client.telStatus);
          this.client.telStatus[this.name] = DeviceState.OFFLINE;
          this.client.emit(EventType.ALL, {
            eventType: EventType.CALL_CONN_STATUS_EVENT,
            data: { localDevice: this.name, localState: DeviceState.OFFLINE },
          });
          console.warn(`软电话:${this.name}与服务器断开连接`);
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
  };

  DispRTC.RTCStream.WebrtcStack = class {
    constructor(rtcStream, wsurl, tel, passwd, sessionEvent, iceservers, client) {
      if (!wsurl.endsWith('/')) {
        wsurl = wsurl + '/';
      }
      this.rtcStream = rtcStream;
      this.client = client;
      this.wsurl = wsurl + 'webrtcMedia';
      this.tel = tel;
      this.passwd = passwd;
      this.WSStatus = false;
      this.onMessage = sessionEvent;

      this.heartTimeout = 20000;

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

      this.ringbacktone = new Audio('/sounds/ringbacktone.wav');
      this.ringbacktone.autoplay = false;
      this.ringbacktone.loop = true;
      this.ringbacktone.muted = true;
      this.ringbacktone.addEventListener('play', () => {
        console.error('ringbacktone play');
        this.ringbacktone.muted = false;
      });

      this.ringtone = new Audio('/sounds/ringtone.wav');
      this.ringtone.autoplay = false;
      this.ringtone.loop = true;
      this.ringtone.muted = true;
      this.ringtone.addEventListener('play', () => {
        console.error('ringtone play');
        this.ringtone.muted = false;
      });

      this.notify({ type: 'starting', description: 'Stack starting' });

      this.WS = new WebSocket(this.wsurl);
      this.interval = null;
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
        console.log('ws connect succ.');
        this.notify({ type: 'started', description: 'Stack started' });
        this.WSStatus = true;
        this.notify({ type: 'connecting', description: 'connecting' });
        this.login();
      };
      this.WS.onclose = (ev) => {
        console.log('ws connect close.', JSON.stringify(ev));
        this.WSStatus = false;
        this.regStatus = false;
        this.callStatus = false;
        if (this.interval) {
          clearInterval(this.interval);
          this.interval = null;
        }
        this.notify({ type: RTCStreamEventType.ON_DISCONNECT });

        //重新注册
        if (this.client.isLogin() && !this.rtcStream.loginFail) {
          this.client.initSoftPhone();
        }
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
              reason: recvmsg.reason === undefined ? '' : recvmsg.reason,
            });
            if (this.interval) {
              clearInterval(this.interval);
              this.interval = null;
            }
            this.interval = setInterval(() => this.heart(), this.heartTimeout);
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
              tel: recvmsg.content === undefined ? '' : recvmsg.content,
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
              reason: recvmsg.reason === undefined ? '' : recvmsg.reason,
            });
            this.closeCall();
            this.ringtone.pause();
            this.ringbacktone.pause();
            break;
          case RTCStreamEventType.ON_NEW_CALL:
            // 判断是否已存在通话
            for (let item of DispRTC.RTCStream.instances.values()) {
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
              var isAndroid = u.indexOf('Android') > -1 || u.indexOf('Adr') > -1; //android终端
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
              console.error('ringtone.play', error);
            }

            this.notify(recvmsg);
            break;
        }
      };

      this.WS.onerror = (ev) => {
        this.rtcStream.loginFail = true;
        console.error('WS.onerror', ev);
      };
    }

    notify(content) {
      if (this.onMessage != null) {
        this.onMessage(content);
      }
    }

    onanswer(sdp) {
      this.PC.setRemoteDescription(
        new RTCSessionDescription({
          type: 'answer',
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
            type: 'offer',
            sdp: sdp,
          })
        );
        this.setRemoteSdp = true;
      }
    }

    heart() {
      if (this.regStatus) {
        this.sendTo({ type: RTCStreamEventType.HEART, user_name: this.tel });
      }
    }

    login() {
      if (this.isWindows()) {
        this.sendTo({
          type: RTCStreamEventType.LOGIN,
          user_name: this.tel,
          pass_word: this.passwd,
          user_agent: 'window',
        });
      } else {
        this.sendTo({
          type: RTCStreamEventType.LOGIN,
          user_name: this.tel,
          pass_word: this.passwd,
          user_agent: 'other',
        });
      }
    }

    isWindows() {
      var useragnet = navigator.platform;
      return useragnet.indexOf('Win') >= 0;
    }

    logout() {
      this.regStatus = false;
      this.sendTo({ type: RTCStreamEventType.LOGOUT, user_name: this.tel });
    }

    dtmf(value) {
      if (!this.callStatus) {
        return false;
      }
      var dtmfAudio = new Audio('/static/sounds/dtmf.wav');
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
      this.ringtone.pause();
      this.ringbacktone.pause();
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
          console.log('user is not login');
          this.notify({
            type: RTCStreamEventType.MAKE_CALL,
            result: false,
            reason: '用户未登录',
          });
          return;
        }

        if (this.callStatus) {
          this.notify({
            type: RTCStreamEventType.MAKE_CALL,
            result: false,
            reason: '已经在呼叫中',
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
            this.PC.setLocalDescription(offer);
          });
        };

        this.PC.onicecandidate = (iceevent) => {
          if (iceevent.candidate == null) {
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
          reason: '' + e,
        });
      }
    }

    answer(localElement, remoteElement) {
      console.log('0-----answer-----', localElement?.id, remoteElement?.id);
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
          if (this.remoteElement.tagName === 'VIDEO' && rtcTrackEvent.track.kind === 'audio') {
            return;
          }
          if (this.remoteElement.tagName === 'AUDIO' && rtcTrackEvent.track.kind === 'video') {
            return;
          }
          this.remoteElement.srcObject = rtcTrackEvent.streams[0];

          this.remoteElement.muted = false;
          this.remoteElement.play();
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
        console.log('wsstatus error, wsstatus: ', this.WSStatus);
      }
    }
    gotLocalMedia() {
      var config = {};

      if (this.isVideo) {
        config = {
          audio: { echoCancellation: true, noiseSuppression: true },
          video: {
            advanced: [{ facingMode: { exact: 'user' }, height: 720, width: 1280 }],
          },
        };
      } else {
        config = {
          audio: { echoCancellation: true, noiseSuppression: true },
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
            reason: '浏览器不支持WEBRTC',
          });
          this.closeCall();
        } else {
          this.notify({
            type: RTCStreamEventType.ANSWER,
            result: false,
            reason: '浏览器不支持WEBRTC',
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
        this.localElement.muted = false;
        this.localElement.play();
      }

      stream.getTracks().forEach((track) => {
        if (this.PC) this.PC.addTrack(track, stream);
      });
    }

    getMediaFail(error) {
      console.log('getMediaFail error', error);
      if (this.callDirection === CALL_DIRECTION.OUT) {
        this.notify({
          type: RTCStreamEventType.MAKE_CALL,
          result: false,
          reason: '获取媒体资源失败',
        });
        this.closeCall();
      } else {
        this.notify({
          type: RTCStreamEventType.ANSWER,
          result: false,
          reason: '获取媒体资源失败',
        });
        this.hangupWithReason('getUserMedia function');
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

    closeCall2() {
      if (this.localStream != null) {
        this.localStream.getTracks().forEach((track) => {
          track.stop();
        });
      }
    }

    muted(isMuted = true) {
      this.localStream.getTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }
  };

  /**
   * rtsp播放控制类
   */
  DispRTC.RTSPStream = class {
    constructor(options, client) {
      this.Server = options.server + '/rtspplay'; // 服务器
      this.RtspUrl = options.rtspUrl;
      this.callback = options.callback;
      this.RemoteVideo =
        options.remoteVideo instanceof HTMLElement ? options.remoteVideo : document.getElementById(options.remoteVideo);
      this.SendChannel = null;
      this.PC = new RTCPeerConnection();
      this.Interval = null;
      this.Offer = null;
      this.PC.onnegotiationneeded = (e) => this.handleNegotiationNeededEvent(e);
      this.PC.onicecandidate = (e) => this.onicecandidateEvent(e);
      this.PC.ontrack = (e) => this.ontrackEvent(e);
    }

    async handleNegotiationNeededEvent() {
      this.Offer = await this.PC.createOffer();
      await this.PC.setLocalDescription(this.Offer);
    }

    onicecandidateEvent(e) {
      const self = this;
      if (e.candidate == null) {
        let formData = new FormData();
        formData.append('url', btoa(self.RtspUrl));
        formData.append('data', btoa(self.PC.localDescription.sdp));
        axios
          .post(`${self.Server}/recive`, formData, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          })
          .then((res) => {
            console.log('recv receive response', JSON.stringify(res.data));
            if (res.data.result !== 'succ') {
              if (self.callback) {
                self.callback(
                  {
                    status: 'fail',
                    reason: res.data.reason,
                    elementId: self.RemoteVideo.id,
                  },
                  self
                );
              }
              self.close();
              console.log('onicecandidateEvent 播放失败', res.data.reason);
              return;
            }
            try {
              self.PC.setRemoteDescription(
                new RTCSessionDescription({
                  type: 'answer',
                  sdp: atob(res.data.data),
                })
              );
            } catch (err) {
              console.log(self.RtspUrl, err);
            }
          })
          .catch((err) => {
            console.log('onicecandidateEvent 播放失败', err);
            self.callback(
              {
                status: 'fail',
                reason: err,
                elementId: self.RemoteVideo.id,
              },
              self
            );
            self.close();
          });
      }
    }

    ontrackEvent(e) {
      // console.log('ontrackEvent');
      this.RemoteVideo.srcObject = e.streams[0];
      this.RemoteVideo.muted = true;
      this.RemoteVideo.autoplay = true;
      // this.RemoteVideo.controls = false;
      // this.RemoteVideo.width = 640;
    }
    /**
     * 播放
     */
    play() {
      const self = this;
      if (Util.isEmpty(this.RtspUrl)) {
        return Promise.reject(R.err('播放源地址不能为空'));
      }
      if (!this.RemoteVideo) {
        return Promise.reject(R.err('播放目的标签不能为空'));
      }
      console.log('RTSPStream play rtspUrl', this.RtspUrl);
      return new Promise((resolve, reject) => {
        let formData = new FormData();
        formData.append('url', btoa(self.RtspUrl));
        axios
          .post(`${self.Server}/play`, formData, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          })
          .then((res) => {
            if (res.data.result !== 'succ') {
              console.log('rtspPlay播放失败', res.reason, self.RtspUrl);
              return reject(res.data);
            }

            resolve(res.data);

            self.PC.addTransceiver('video', {
              direction: 'sendrecv',
            });

            self.SendChannel = self.PC.createDataChannel('foo');
            self.SendChannel.onclose = (event) => {
              console.log('sendChannel has closed');
              self.close();
              if (self.callback) self.callback({ status: 'close', elementId: self.RemoteVideo.id }, self);
            };
            self.SendChannel.onopen = (event) => {
              console.error('打开摄像头成功', self.RemoteVideo.id, event.type);
              if (self.callback) self.callback({ status: 'open', elementId: self.RemoteVideo.id }, self);
              console.log('sendChannel has opened');
              self.SendChannel.send('Keep-Alive');
              self.Interval = setInterval(function () {
                self.SendChannel.send('Keep-Alive');
                // console.log("keep-Alive");
              }, 3000);
            };
            self.SendChannel.onmessage = (event) => {
              console.log('Message from DataChannel: payload ' + event.data);
            };
          })
          .catch((err) => {
            console.log('播放失败 rtspPlay', err);
            reject(err);
          });
      });
    }

    /**
     * 关闭
     */
    close() {
      try {
        this.Interval && clearInterval(this.Interval);
        this.PC.close();
      } catch (error) {}
    }
  };

  /**
   * 呼叫控制类
   */
  class CallSessions {
    constructor(client) {
      this.client = client;
    }

    /**
     * 获取可用的主叫号码
     * @param {Boolean} isMicro 是否为手咪
     * @returns
     */
    getAvailableTel(isMeeting = false, isMicro = false) {
      if (!this.client.operatorInfo) {
        console.warn('用户信息为空');
        return null;
      }
      let { mainTel, viceTel, mainTelType, viceTelType } = this.client.operatorInfo;

      if (isMeeting) {
        let inStatus = [
          DeviceState.TALK,
          DeviceState.HOLD,
          DeviceState.SINGLE_TALK,
          // DeviceState.allowspeak, 无该变量,下面修改
          DeviceState.ALLOW_SPEAK,
          DeviceState.BAN_SPEAK,
        ];
        if (
          mainTel &&
          mainTelType !== HandType.HAND_MICROPHONE &&
          this.client.telStatus[mainTel] &&
          inStatus.includes(this.client.telStatus[mainTel])
        ) {
          return mainTel;
        }
        if (
          viceTel &&
          viceTelType !== HandType.HAND_MICROPHONE &&
          this.client.telStatus[viceTel] &&
          inStatus.includes(this.client.telStatus[viceTel])
        ) {
          return viceTel;
        }
      }

      if (mainTel && (!this.client.telStatus[mainTel] || this.client.telStatus[mainTel] === DeviceState.IDLE)) {
        if (isMicro) {
          if (mainTelType !== HandType.PHONE) return mainTel;
        } else if (mainTelType !== HandType.HAND_MICROPHONE) {
          return mainTel;
        }
      }
      if (viceTel && (!this.client.telStatus[viceTel] || this.client.telStatus[viceTel] === DeviceState.IDLE)) {
        if (isMicro) {
          if (viceTelType !== HandType.PHONE) return viceTel;
        } else if (viceTelType !== HandType.HAND_MICROPHONE) {
          return viceTel;
        }
      }
      console.log('getAvailableTel telStatus', this.client.telStatus);
      return null;
    }

    /**
     * 获取号码详细状态信息
     * @param {String} localDevice 号码
     * @param {String} userID 用户ID可空
     * @returns
     */
    getCallConnStatus(localDevice, userID) {
      return Api.CallSessions.getCallConnStatus({ localDevice, userID });
    }

    /**
     * 获取号码状态列表
     * @param {String} groupID 组ID
     * @param {Integer} beginIndex 起始索引
     * @param {Integer} count 查询条数
     * @returns
     */
    listCallConnStatus(groupID, beginIndex, count) {
      return Api.CallSessions.listCallConnStatus({ groupID, beginIndex, count });
    }

    /**
     * 单呼
     * @param {String} calledDevice 被叫号码
     * @param {String} callType 呼叫类型, 默认语音 @see CallType
     * @param {String} duplexMode 双工模式，默认全双工 @see DuplexMode
     * @param {String} userID 被叫用户ID,可选
     * @returns
     */
    makeCall({ calledDevice, callType = CallType.AUDIO, duplexMode = DuplexMode.FULL, userID }) {
      if (Util.isEmpty(calledDevice)) return Promise.reject(R.err('被叫号码不能为空'));
      let callingDevice = this.getAvailableTel(false, duplexMode === DuplexMode.HALF);
      if (!callingDevice) return Promise.reject(R.err('未正确配置可用的主叫话机，请检查。', 6001));
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
    clearConnection({ calledDevice, userID }) {
      if (Util.isEmpty(calledDevice)) return Promise.reject(R.err('被拆号码不能为空'));
      return Api.CallSessions.clearConnection({ calledDevice, userID });
    }

    /**
     * 组呼
     * @param {String} groupID 组ID
     * @param {String} meetID
     * @param {String} callMode
     * @param {String} meetMode
     * @returns
     */
    groupCall({ groupID, meetID, callMode = CallMode.PARALLEL, meetMode = MeetMode.AUDIO }) {
      if (Util.isEmpty(groupID)) return Promise.reject(R.err('组ID不能为空'));
      let callingDevice = meetID
        ? this.client.conferenceRoom.meetingCalling.get(meetID) || this.getAvailableTel(true)
        : this.getAvailableTel(true);
      if (!callingDevice) return Promise.reject(R.err('未正确配置可用的主叫话机，请检查。', 6001));
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
      let meet = this.client.conferenceRoom.systemMeetList.find((m) => m.meetMode === meetMode);
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
              meet = res.data.list.find((m) => m.meetMode === meetMode && m.isSystem === YesOrNo.YES);
              if (meet) {
                meetID = meet.meetID;
                this.client.conferenceRoom.meetingCalling.set(meetID, callingDevice);
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
              } else reject(R.err('没有会议资源'));
            })
            .catch((err) => {
              reject(R.err('没有会议资源'));
            });
        });
      }
    }

    /**
     * 结束组呼
     * @param {String} callSessionID
     * @returns
     */
    endGroupCall(callSessionID) {
      if (Util.isEmpty(callSessionID)) return Promise.reject(R.err('呼叫ID不能为空'));
      return Api.CallSessions.endGroupCall(callSessionID);
    }

    /**
     * 选呼
     * @param {Object} called
     * @param {String} callMode
     * @param {String} meetID
     * @returns
     */
    selectCall({ called, meetID, callMode = CallMode.PARALLEL, meetMode = MeetMode.AUDIO }) {
      if (Util.isEmpty(called)) return Promise.reject(R.err('被叫用户不能为空'));
      let callingDevice = meetID
        ? this.client.conferenceRoom.meetingCalling.get(meetID) || this.getAvailableTel(true)
        : this.getAvailableTel(true);
      if (!callingDevice) return Promise.reject(R.err('未正确配置可用的主叫话机，请检查。', 6001));
      if (!called) {
        called = [{ calledDevice: callingDevice, userID: this.client.operatorInfo.operatorID }];
        callingDevice = undefined;
      }

      if (meetID) {
        this.client.conferenceRoom.meetingCalling.set(meetID, callingDevice);
        return Api.CallSessions.selectCall({
          callingDevice,
          called,
          callMode,
          meetID,
        });
      }
      //会议ID不存在
      let meet = this.client.conferenceRoom.systemMeetList.find((m) => m.meetMode === meetMode);
      if (meet) {
        meetID = meet.meetID;
        this.client.conferenceRoom.meetingCalling.set(meetID, callingDevice);
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
              meet = res.data.list.find((m) => m.meetMode === meetMode && m.isSystem === YesOrNo.YES);
              if (meet) {
                meetID = meet.meetID;
                this.client.conferenceRoom.meetingCalling.set(meetID, callingDevice);
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
              } else reject(R.err('没有会议资源'));
            })
            .catch((err) => {
              reject(R.err('没有会议资源'));
            });
        });
      }
    }

    /**
     * 结束选呼
     * @param {String} callSessionID
     * @returns
     */
    endSelectCall(callSessionID) {
      if (Util.isEmpty(callSessionID)) return Promise.reject(R.err('呼叫ID不能为空'));
      return Api.CallSessions.endSelectCall(callSessionID);
    }

    /**
     * 点名
     * @param {Object} called
     * @param {String} callMode
     * @param {String} fileName
     * @returns
     */
    rollCall({ called, callMode = CallMode.PARALLEL, fileName }) {
      if (Util.isEmpty(called)) return Promise.reject(R.err('被叫用户不能为空'));
      let callingDevice = this.getAvailableTel();
      if (!callingDevice) return Promise.reject(R.err('未正确配置可用的主叫话机，请检查。', 6001));
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
    endRollCall(callSessionID) {
      if (Util.isEmpty(callSessionID)) return Promise.reject(R.err('呼叫ID不能为空'));
      return Api.CallSessions.endRollCall(callSessionID);
    }

    /**
     * 轮询
     * @param {Object} called
     * @param {String} callType
     * @returns
     */
    pollCall({ called, callType = CallType.AUDIO }) {
      if (Util.isEmpty(called)) return Promise.reject(R.err('被叫用户不能为空'));
      let callingDevice = this.getAvailableTel();
      if (!callingDevice) return Promise.reject(R.err('未正确配置可用的主叫话机，请检查。', 6001));
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
    endPollCall(callSessionID) {
      if (Util.isEmpty(callSessionID)) return Promise.reject(R.err('呼叫ID不能为空'));
      return Api.CallSessions.endPollCall(callSessionID);
    }

    /**
     * 群答
     * @param {Object} called
     * @param {String} callMode
     * @param {String} meetID
     * @returns
     */
    groupAnswerCall(meetID, isSpeak = YesOrNo.NO) {
      let callingDevice = meetID
        ? this.client.conferenceRoom.meetingCalling.get(meetID) || this.getAvailableTel(true)
        : this.getAvailableTel(true);
      if (!callingDevice) return Promise.reject(R.err('未正确配置可用的主叫话机，请检查。', 6001));
      if (meetID) {
        this.client.conferenceRoom.meetingCalling.set(meetID, callingDevice);
        return Api.CallSessions.groupAnswerCall({
          callingDevice,
          isSpeak,
          meetID,
        });
      }
      //会议ID不存在
      let meet = this.client.conferenceRoom.systemMeetList.find((m) => m.meetMode === MeetMode.AUDIO);
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
              meet = res.data.list.find((m) => m.meetMode === MeetMode.AUDIO && m.isSystem === YesOrNo.YES);
              if (meet) {
                meetID = meet.meetID;
                this.client.conferenceRoom.meetingCalling.set(meetID, callingDevice);
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
              } else reject(R.err('没有会议资源'));
            })
            .catch((err) => {
              reject(R.err('没有会议资源'));
            });
        });
      }
    }

    /**
     * 广播
     * @param {Object} called
     * @param {String} callMode
     * @param {String} meetID
     * @returns
     */
    broadcastCall({ called, callMode = BroadcastMode.MANUAL, callLoop = 0, fileName, callSessionID }) {
      if (Util.isEmpty(called)) return Promise.reject(R.err('被叫用户不能为空'));
      let callingDevice = this.getAvailableTel();
      if (!callingDevice) return Promise.reject(R.err('未正确配置可用的主叫话机，请检查。', 6001));
      if (callMode === BroadcastMode.FILE && !fileName) {
        return Promise.reject(R.err('文件广播文件名不能为空'));
      }
      if (callMode === BroadcastMode.TTS && !fileName) {
        return Promise.reject(R.err('文本文字内容不能为空'));
      }
      return Api.CallSessions.broadcastCall({
        callingDevice,
        called,
        callMode,
        callLoop,
        fileName,
        callSessionID,
      });
    }

    /**
     * 结束广播
     * @param {String} callSessionID
     * @returns
     */
    endBroadcastCall(callSessionID) {
      if (Util.isEmpty(callSessionID)) return Promise.reject(R.err('呼叫ID不能为空'));
      return Api.CallSessions.endBroadcastCall(callSessionID);
    }

    /**
     * 获取用户呼入队列列表
     * @param {Integer} beginIndex
     * @param {Integer} count
     */
    listCallQueue(beginIndex, count) {
      return Api.CallSessions.listCallQueue({
        beginIndex,
        count,
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
    joinMeetCall({ callingDevice, calledDevice, userID, meetID, meetMode = MeetMode.AUDIO }) {
      if (Util.isEmpty(calledDevice)) return Promise.reject(R.err('被叫号码不能为空'));
      callingDevice ??= this.getAvailableTel(true);
      if (!callingDevice) return Promise.reject(R.err('未正确配置可用的主叫话机，请检查。', 6001));
      return new Promise(async (resolve, reject) => {
        //会议ID不存在
        if (!meetID) {
          if (!this.client.conferenceRoom.systemMeetList || !this.client.conferenceRoom.systemMeetList.length) {
            await this.client.conferenceRoom
              .listMeet((res) => {
                let meet = res.data.list.find((m) => m.meetMode === meetMode && m.isSystem === YesOrNo.YES);
                if (meet) {
                  meetID = meet.meetID;
                }
              })
              .catch((err) => {
                reject(R.err('没有会议资源'));
              });
          } else {
            let meet = this.client.conferenceRoom.systemMeetList.find((m) => m.meetMode === meetMode);
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
        } else reject(R.err('没有会议资源'));
      });
    }

    /**
     * 应答
     * @param {String} calledDevice
     * @param {String} userID
     */
    answerCall({ calledDevice, userID }) {
      if (Util.isEmpty(calledDevice)) return Promise.reject(R.err('被应答的号码不能为空'));
      let callingDevice = this.getAvailableTel();
      if (!callingDevice) return Promise.reject(R.err('未正确配置可用的主叫话机，请检查。', 6001));
      return Api.CallSessions.answerCall({
        callingDevice,
        calledDevice,
        userID,
      });
    }

    /**
     * 呼叫保持
     * @param {Object} calledDevice
     * @param {String} userID
     * @returns
     */
    holdCall({ calledDevice, userID }) {
      if (Util.isEmpty(calledDevice)) return Promise.reject(R.err('用户号码不能为空'));
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
    unholdCall({ calledDevice, userID, callType = CallType.AUDIO }) {
      if (Util.isEmpty(calledDevice)) return Promise.reject(R.err('解除保持用户号码不能为空'));
      let callingDevice = this.getAvailableTel();
      if (!callingDevice) return Promise.reject(R.err('未正确配置可用的主叫话机，请检查。', 6001));
      return Api.CallSessions.unholdCall({
        callingDevice,
        calledDevice,
        userID,
        callType,
      });
    }

    /**
     * 呼叫转移
     * @param {Object} activeDevice 被转移的用户号码
     * @param {Object} calledDevice 转移至用户号码
     * @param {String} userID 转移至用户id
     * @returns
     */
    singleTransferCall({ activeDevice, calledDevice, userID }) {
      if (Util.isEmpty(activeDevice)) return Promise.reject(R.err('被转移用户号码不能为空'));
      if (Util.isEmpty(calledDevice)) return Promise.reject(R.err('转移至用户号码不能为空'));
      return Api.CallSessions.singleTransferCall({
        activeDevice,
        calledDevice,
        userID,
      });
    }

    /**
     * 咨询转接
     * @param {Object} heldDevice 被转接的用户号码
     * @param {Object} heldUserID 被转接的用户ID
     * @param {Object} calledDevice 咨询的用户号码
     * @param {String} userID 咨询的用户id
     * @returns
     */
    consultCallTransfer({ heldDevice, heldUserID, calledDevice, userID }) {
      if (Util.isEmpty(heldDevice)) return Promise.reject(R.err('被转接用户号码不能为空'));
      if (Util.isEmpty(calledDevice)) return Promise.reject(R.err('转接用户号码不能为空'));
      return Api.CallSessions.consultCallTransfer({
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
    forceInsertCall({ calledDevice, userID }) {
      if (Util.isEmpty(calledDevice)) return Promise.reject(R.err('被强插用户号码不能为空'));
      let callingDevice = this.getAvailableTel();
      if (!callingDevice) return Promise.reject(R.err('未正确配置可用的主叫话机，请检查。', 6001));
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
    forceReleaseCall({ calledDevice, userID }) {
      if (Util.isEmpty(calledDevice)) return Promise.reject(R.err('被强拆用户号码不能为空'));
      let callingDevice = this.getAvailableTel();
      if (!callingDevice) return Promise.reject(R.err('未正确配置可用的主叫话机，请检查。', 6001));
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
    forceClearCall({ calledDevice, userID }) {
      if (Util.isEmpty(calledDevice)) return Promise.reject(R.err('被强断用户号码不能为空'));
      let callingDevice = this.getAvailableTel();
      if (!callingDevice) return Promise.reject(R.err('未正确配置可用的主叫话机，请检查。', 6001));
      return Api.CallSessions.forceClearCall({
        callingDevice,
        calledDevice,
        userID,
      });
    }
  }

  /**
   * 会议控制类
   */
  class ConferenceRoom {
    constructor(client) {
      this.client = client;
      this.systemMeetList = [];
      this.meetingCalling = new Map();
      this.supportedMixType = [1, 2, 4, 6, 8, 9, 13, 16];
    }

    /**
     * 初始化数据
     */
    initData() {
      this.listMeet()
        .then((res) => {
          this.systemMeetList = res.data.list.filter((m) => m.isSystem === YesOrNo.YES);
        })
        .catch((err) => {});
    }

    /**
     * 获取会议列表 {createID, meetType, beginIndex, count}
     * createID:会议创建者ID
     * meetType: 会议类型
     * beginIndex: 起始索引
     * count：页数量
     * @param {Object} data
     */
    listMeet(data) {
      return new Promise((resolve, reject) => {
        Api.ConferenceRoom.listMeet(data)
          .then((res) => {
            let meetList = res.data.list;
            this.systemMeetList = meetList.filter((m) => m.isSystem === YesOrNo.YES);
            res.data.list = meetList.filter((m) => m.meetMode !== 'monitor');
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
    createMeet({ meetName, meetNum, meetMode, isAllowSpeak, callinState, callinNum, callinPwd }) {
      if (Util.isEmpty(meetName) && Util.isEmpty(meetNum)) {
        return Promise.reject(R.err('会议名称或会议号码不能为空'));
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
    editMeet({ meetID, meetName, meetNum, isAllowSpeak, callinState, callinNum, callinPwd }) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err('会议ID不能为空'));
      }
      if (Util.isEmpty(meetName) && Util.isEmpty(meetNum)) {
        return Promise.reject(R.err('会议名称或会议号码不能为空'));
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
     * 获取会议详细信息
     */
    getMeetDetail(meetID) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err('会议ID不能为空'));
      }
      return Api.ConferenceRoom.getMeetDetail(meetID);
    }

    /**
     * 获取会议成员列表
     */
    listMeetMember(data) {
      if (Util.isEmpty(data.meetID)) {
        return Promise.reject(R.err('会议ID不能为空'));
      }
      return Api.ConferenceRoom.listMeetMember(data);
    }

    /**
     * 踢出成员
     */
    kickMeet(data = {}) {
      if (Util.isEmpty(data.meetID)) {
        return Promise.reject(R.err('会议ID不能为空'));
      }
      return Api.ConferenceRoom.kickMeet(data);
    }

    /**
     * 单独通话
     */
    singleTalk({ meetID, callingDevice, activeDevice, userID }) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err('会议ID不能为空'));
      }
      if (Util.isEmpty(activeDevice)) {
        return Promise.reject(R.err('会议成员号码不能为空'));
      }
      callingDevice ??= this.meetingCalling.get(meetID);
      if (!callingDevice) {
        callingDevice = this.client.callSession.getAvailableTel(true);
        if (!callingDevice) return Promise.reject(R.err('未正确配置可用的主叫话机，请检查。', 6001));
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
     */
    backMeet({ meetID, activeDevice, userID }) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err('会议ID不能为空'));
      }
      return Api.ConferenceRoom.backMeet({ meetID, activeDevice, userID });
    }

    /**
     * 禁言
     */
    banSpeak({ meetID, activeDevice, userID }) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err('会议ID不能为空'));
      }
      return Api.ConferenceRoom.banSpeak({ meetID, activeDevice, userID });
    }

    /**
     * 发言
     */
    allowSpeak({ meetID, activeDevice, userID }) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err('会议ID不能为空'));
      }
      return Api.ConferenceRoom.allowSpeak({ meetID, activeDevice, userID });
    }

    /**
     * 会议混码
     */
    startMeetVideoMix({ meetID, sourceInfo, mixType = 1, videoType = '720P' }) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err('会议ID不能为空'));
      }
      if (!this.supportedMixType.includes(mixType)) {
        return Promise.reject(R.err('不支持的混码类型'));
      }
      if (sourceInfo.length != mixType) {
        console.log('混码源和类型不匹配 ', mixType, JSON.stringify(sourceInfo));
        return Promise.reject(R.err('混码源和类型不匹配'));
      }
      return Api.ConferenceRoom.startMeetVideoMix({
        meetID,
        sourceInfo,
        videoType,
        mixType,
      });
    }

    /**
     * 删除会议
     */
    deleteMeet(meetID) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err('会议ID不能为空'));
      }
      return Api.ConferenceRoom.destroyMeet(meetID);
    }

    /**
     * 锁定会议
     */
    lockMeet({ meetID, isLocked }) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err('会议ID不能为空'));
      }
      if (Util.isEmpty(isLocked)) {
        return Promise.reject(R.err('锁定状态不能为空'));
      }
      return Api.ConferenceRoom.lockMeet({ meetID, isLocked });
    }

    /**
     * 会议广播
     */
    meetBroadcast({ meetID, isBroadcast = YesOrNo.YES, fileName }) {
      if (Util.isEmpty(meetID)) {
        return Promise.reject(R.err('会议ID不能为空'));
      }
      if (Util.isEmpty(fileName)) {
        return Promise.reject(R.err('文件名不能为空'));
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
    getMeetingCalling(meetID) {
      return meetID ? this.meetingCalling.get(meetID) : null;
    }
  }

  /**
   * 视频控制类
   */
  class VideoSessions {
    constructor(client) {
      this.client = client;
    }

    /**
     * 获取视频通话图像
     * @returns
     */
    getVideoPhoneRtspUrl({ calledDevice, userID }) {
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
     * 获取视频rtspUrl
     * @returns
     */
    openVideo(videoID) {
      return Api.VideoSessions.openVideo({ videoID });
    }
    /**
     * 获取视频rtspUrl
     * @returns
     */
    closeVideo(flowID) {
      return Api.VideoSessions.closeVideo(flowID);
    }
    /**
     * 云台控制
     * @returns
     */
    ptzControl({ videoID, command, param = '128' }) {
      if (Util.isEmpty(videoID)) return Promise.reject(R.err('请选择监控'));
      if (Util.isEmpty(command)) return Promise.reject(R.err('云台控制命令不能为空'));

      if (param < 1 || param > 255) return Promise.reject(R.err('云台速度值范围0-255'));
      return Api.VideoSessions.ptzControl({
        videoID,
        command,
        param: param + '',
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
     * @returns
     */
    list(data) {
      return Api.SmsSessions.list(data);
    }

    /**
     * 获取短信详细信息
     * @returns
     */
    get(data = {}) {
      if (Util.isEmpty(data.smsContacts) && Util.isEmpty(data.smsGroupID))
        return Promise.reject(R.err('短信号码和群聊ID必选其一'));

      return Api.SmsSessions.get(data);
    }

    /**
     * 获取定时短信列表
     * @returns
     */
    crontab(data) {
      return Api.SmsSessions.crontab(data);
    }

    /**
     * 根据关键字获取短信列表
     * @returns
     */
    match(data) {
      return Api.SmsSessions.match(data);
    }

    /**
     * 短信发送
     * @returns
     */
    send(data) {
      if (Util.isEmpty(data.smsFormat) || Util.isEmpty(data.smsType) || Util.isEmpty(data.smsContacts))
        return Promise.reject(R.err('参数缺失'));
      if (data.smsFormat === 'sms') {
        if (Util.isEmpty(data.smsContent)) {
          return Promise.reject(R.err('短信内容不能为空'));
        }
      } else if (Util.isEmpty(data.smsFileName)) {
        return Promise.reject(R.err('文件名不能为空'));
      }
      return Api.SmsSessions.send(data);
    }
    /**
     * 短信删除
     * @returns
     */
    delete(data) {
      if (Util.isEmpty(data.smsID) && Util.isEmpty(data.smsContacts) && Util.isEmpty(data.smsGroupID))
        return Promise.reject(R.err('短信ID、短信号码和群聊ID必选其一'));
      return Api.SmsSessions.delete(data);
    }
    /**
     * 短信已读
     * @returns
     */
    read(data) {
      if (Util.isEmpty(data.smsID) && Util.isEmpty(data.smsContacts) && Util.isEmpty(data.smsGroupID))
        return Promise.reject(R.err('短信ID、短信号码和群聊ID必选其一'));
      return Api.SmsSessions.read(data);
    }
    /**
     * 群聊设置
     * @returns
     */
    setGroup(data) {
      if (Util.isEmpty(data.event) && Util.isEmpty(data.smsGroupName)) return Promise.reject(R.err('参数缺失'));
      return Api.SmsSessions.setGroup(data);
    }
    /**
     * 群聊查询
     * @returns
     */
    getGroup(smsGroupID) {
      if (Util.isEmpty(data.smsGroupID)) return Promise.reject(R.err('群聊ID不能为空'));
      return Api.SmsSessions.getGroup(smsGroupID);
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
     * @returns
     */
    list(data) {
      return Api.FaxSessions.list(data);
    }

    /**
     * 获取传真详细信息
     * @returns
     */
    get(data = {}) {
      if (Util.isEmpty(data.faxContacts) && Util.isEmpty(data.faxGroupID))
        return Promise.reject(R.err('传真号码和群发组ID必选其一'));

      return Api.FaxSessions.get(data);
    }

    /**
     * 获取定时传真列表
     * @returns
     */
    crontab(data) {
      return Api.FaxSessions.crontab(data);
    }

    /**
     * 根据关键字获取传真列表
     * @returns
     */
    match(data) {
      return Api.FaxSessions.match(data);
    }

    /**
     * 传真发送
     * @returns
     */
    send(data) {
      if (Util.isEmpty(data.faxContent)) return Promise.reject(R.err('文件名不能为空'));
      if (Util.isEmpty(data.faxContacts)) return Promise.reject(R.err('接收人不能为空'));
      if (Util.isEmpty(data.faxRealFileName)) data.faxRealFileName = data.faxContent;
      return Api.FaxSessions.send(data);
    }
    /**
     * 传真删除
     * @returns
     */
    delete(data) {
      if (Util.isEmpty(data.faxID) && Util.isEmpty(data.faxContacts) && Util.isEmpty(data.faxGroupID))
        return Promise.reject(R.err('传真ID、传真号码和群发组ID必选其一'));
      return Api.FaxSessions.delete(data);
    }
    /**
     * 传真已读
     * @returns
     */
    read(data) {
      if (Util.isEmpty(data.faxID) && Util.isEmpty(data.faxContacts) && Util.isEmpty(data.faxGroupID))
        return Promise.reject(R.err('传真ID、传真号码和群发组ID必选其一'));
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
     */
    subscribe(data) {
      return Api.Location.subscribe(data);
    }
    /**
     * 获取定位位置信息(最近一次的更新)
     */
    last(data) {
      if (Util.isEmpty(data.deviceCode)) return Promise.reject(R.err('定位号码不能为空'));
      return Api.Location.last(data);
    }
    /**
     * 获取历史定位位置信息
     */
    history(data) {
      if (Util.isEmpty(data.deviceCode)) return Promise.reject(R.err('定位号码不能为空'));
      if (Util.isEmpty(data.start) || Util.isEmpty(data.end)) return Promise.reject(R.err('起始和结束时间不能为空'));
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
    deleteVoiceFile(fileid) {
      return Api.File.VoiceFile.edit(fileid);
    }

    getSmsFileUploadUrl() {
      return `${http.defaults.baseURL}/fileflow/smsfile/upload`;
    }
    getSmsFileUrl(filename = '') {
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
    downloadSmsFile(filename) {
      return Api.File.SmsFile.download(filename);
    }

    getFaxFileUploadUrl() {
      return `${http.defaults.baseURL}/fileflow/faxfile/upload`;
    }
    getFaxFileUrl(filename = '') {
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
    downloadFaxFile(filename) {
      return Api.File.FaxFile.download(filename);
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
        case DataAction.ACTION_LISTSUB:
          return Api.Data.Group.listSub(data);
        default:
          return Promise.reject(R.err('操作类型异常'));
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
        case DataAction.ACTION_LISTSUB:
          return Api.Data.Operator.list(data);
        case DataAction.ACTION_UPDATE:
          return Api.Data.Operator.edit(data);
        default:
          return Promise.reject(R.err('操作类型异常'));
      }
    }

    /**
     * 职员操作
     * @param {String} dataAction @see DataAction
     * @param {Object} data 数据，查询时为查询条件，新增修改删除为数据体
     */
    emloyeeSync(dataAction, data) {
      switch (dataAction) {
        case DataAction.ACTION_LIST:
        case DataAction.ACTION_LISTSUB:
          return Api.Data.Employee.list(data);
        default:
          return Promise.reject(R.err('操作类型异常'));
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
          return Api.Data.VideoGroup.listSub(data);
        default:
          return Promise.reject(R.err('操作类型异常'));
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
          return Api.Data.Video.list(data);
        default:
          return Promise.reject(R.err('操作类型异常'));
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
          return Api.Data.Blacklist.list(data);
        case DataAction.ACTION_ADD:
          return Api.Data.Blacklist.add(data);
        case DataAction.ACTION_UPDATE:
          return Api.Data.Blacklist.edit(data);
        case DataAction.ACTION_DELETE:
          return Api.Data.Blacklist.delete(data);
        default:
          return Promise.reject(R.err('操作类型异常'));
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
     * @param {DispRTC.Client} client
     */
    static keepalive(client) {
      this.keepaliveTimer && window.clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = setInterval(async () => {
        console.log('keepalive', this.keepaliveTimer, new Date().toLocaleString());
        if (DispRTC.client && DispRTC.client === client) {
          await Api.User.refreshToken()
            .then((res) => {})
            .catch((err) => {
              console.warn('keepalive err', JSON.stringify(err));
            });
        }
      }, 5 * 60 * 1000);
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
  const Api = { Data: {}, File: {} };
  //用户相关
  Api.User = {
    login: (data) => http.post('/account/sign_in', data),
    refreshToken: () => http.post('/account/update_token'),
    logout: () => http.post('/account/sign_out'),
    getUserInfo: () => http.post('/dataflow/operator/get'),
    startWork: () => http.post('/account/work_start'),
    stopWork: () => http.post('/account/work_stop'),
    setUnattend: (data) => http.post('/account/setunattendmode', data),
    suspendRing: () => http.post('/account/suspendring'),
    listAgentStatus: (data) => http.post('/account/operatorstatus/list', data),
    listOperatorLog: (data) => http.post('/account/operatorlog/list', data),
  };
  Api.CallSessions = {
    getCallConnStatus: (data) => http.post('/call_sessions/callconnstatus/get', data),
    listCallConnStatus: (data) => http.post('/call_sessions/callconnstatus/list', data),
    makeCall: (data) => http.post('/call_sessions/makecall', data),
    clearCall: () => http.post('/call_sessions/clearcall'),
    clearConnection: (data) => http.post('/call_sessions/clearconnection', data),
    advanceCall: (data) => http.post('/call_sessions/advancecall', data),
    rollCall: (data) => http.post('/call_sessions/rollcall', data),
    endRollCall: (callSessionID) => http.post('/call_sessions/rollcallend', { callSessionID }),
    pollCall: (data) => http.post('/call_sessions/pollcall', data),
    endPollCall: (callSessionID) => http.post('/call_sessions/pollcallend', { callSessionID }),
    groupCall: (data) => http.post('/call_sessions/groupcall', data),
    endGroupCall: (callSessionID) => http.post('/call_sessions/groupcallend', { callSessionID }),
    selectCall: (data) => http.post('/call_sessions/selectcall', data),
    endSelectCall: (callSessionID) => http.post('/call_sessions/selectcallend', { callSessionID }),
    broadcastCall: (data) => http.post('/call_sessions/broadcastcall', data),
    endBroadcastCall: (callSessionID) => http.post('/call_sessions/broadcastcallend', { callSessionID }),
    listTimingBroadcast: (data) => http.post('/call_sessions/timingbroadcast/list', data),
    addTimingBroadcast: (data) => http.post('/call_sessions/timingbroadcast/add', data),
    editTimingBroadcast: (data) => http.post('/call_sessions/timingbroadcast/update', data),
    delTimingBroadcast: (data) => http.post('/call_sessions/timingbroadcast/delete', data),
    editTimingBroadcast: (taskID) => http.post('/call_sessions/broadcastcall', { taskID }),
    holdCall: (data) => http.post('/call_sessions/holdcall', data),
    unholdCall: (data) => http.post('/call_sessions/unholdcall', data),
    singleTransferCall: (data) => http.post('/call_sessions/singletransfercall', data),
    consultCall: (data) => http.post('/call_sessions/consultcall', data),
    consultCallTransfer: (data) => http.post('/call_sessions/consultcall/transfer', data),
    consultCallReconnect: (data) => http.post('/call_sessions/consultcall/reconnect', data),
    answerCall: (data) => http.post('/call_sessions/answercall', data),
    groupAnswerCall: (data) => http.post('/call_sessions/groupanswercall', data),
    joinMeetCall: (data) => http.post('/call_sessions/joinmeetcall', data),
    recordCall: (data) => http.post('/call_sessions/recordcall', data),
    forceInsertCall: (data) => http.post('/call_sessions/forceinsertcall', data),
    forceReleaseCall: (data) => http.post('/call_sessions/forcereleasecall', data),
    forceClearCall: (data) => http.post('/call_sessions/forceclearcall', data),
    monitorCall: (data) => http.post('/call_sessions/monitorcall', data),
    activateStun: (data) => http.post('/call_sessions/activatestun', data),
    listCallQueue: (data) => http.post('/call_sessions/callqueuestatus/list', data),
    listCallConnStatus: (data) => http.post('/call_sessions/callconnstatus/list', data),
    getCallConnStatus: (data) => http.post('/call_sessions/callconnstatus/get', data),
    listCallRecord: (data) => http.post('/call_sessions/callrecord/list', data),
    listMeetRecord: (data) => http.post('/call_sessions/meetrecord/list', data),
    listBroadcastRecord: (data) => http.post('/call_sessions/broadcastrecord/list', data),
  };
  Api.ConferenceRoom = {
    createMeet: (data) => http.post('/conference_room/create', data),
    editMeet: (data) => http.post('/conference_room/update', data),
    destroyMeet: (meetID) => http.post('/conference_room/destroy', { meetID }),
    lockMeet: (data) => http.post('/conference_room/meet_lock', data),
    meetBroadcast: (data) => http.post('/conference_room/meet_broadcast', data),
    allowSpeak: (data) => http.post('/conference_room/meet_allowspeak', data),
    banSpeak: (data) => http.post('/conference_room/meet_banspeak', data),
    kickMeet: (data) => http.post('/conference_room/meet_kick', data),
    singleTalk: (data) => http.post('/conference_room/meet_singletalk', data),
    backMeet: (data) => http.post('/conference_room/meet_back', data),
    listMeet: (data) => http.post('/conference_room/list', data),
    getMeetDetail: (meetID) => http.post('/conference_room/get', { meetID }),
    listMeetMember: (data) => http.post('/conference_room/meet_member_list', data),
    startMeetVideoMix: (data) => http.post('/conference_room/startmeetvideomix', data),
  };
  Api.VideoSessions = {
    listVideoStatus: () => http.post('/video_sessions/video_monitor/getallvideostatus'),
    openVideo: (data) => http.post('/video_sessions/video_monitor/openvideo', data),
    closeVideo: (flowID) => http.post('/video_sessions/video_monitor/closevideo', { flowID }),
    getVideoPhoneRtspUrl: (data) => http.post('/video_sessions/video_phone/getvideortspurl', data),
    startVideoDispense: (data) => http.post('/video_sessions/video_mix/startvideodispense', data),
    stopVideoDispense: (data) => http.post('/video_sessions/video_mix/stopvideodispense', data),
    ptzControl: (data) => http.post('/video_sessions/video_monitor/ptzcontrol', data),
  };
  Api.FaxSessions = {
    list: (data) => http.post('/fax_sessions/list', data),
    match: (data) => http.post('/fax_sessions/match', data),
    crontab: (data) => http.post('/fax_sessions/crontab/list', data),
    get: (data) => http.post('/fax_sessions/get', data),
    send: (data) => http.post('/fax_sessions/send', data),
    delete: (data) => http.post('/fax_sessions/delete', data),
    read: (data) => http.post('/fax_sessions/read', data),
  };
  Api.SmsSessions = {
    list: (data) => http.post('/sms_sessions/list', data),
    match: (data) => http.post('/sms_sessions/match', data),
    crontab: (data) => http.post('/sms_sessions/crontab/list', data),
    get: (data) => http.post('/sms_sessions/get', data),
    send: (data) => http.post('/sms_sessions/send', data),
    delete: (data) => http.post('/sms_sessions/delete', data),
    read: (data) => http.post('/sms_sessions/read', data),
    setGroup: (data) => http.post('/sms_sessions/group/set', data),
    getGroup: (smsGroupID) => http.post('/sms_sessions/group/get', { smsGroupID }),
  };
  Api.Location = {
    subscribe: (data) => http.post('/location/subscribe', data),
    last: (data) => http.post('/location/points/last', data),
    history: (data) => http.post('/location/points/history', data),
  };
  Api.Data.Group = {
    listSub: (data) => http.post('/dataflow/group/listsub', data),
    add: (data) => http.post('/dataflow/group/add', data),
    edit: (data) => http.post('/dataflow/group/update', data),
    delete: (groupID) => http.post('/dataflow/group/delete', { groupID }),
  };
  Api.Data.Operator = {
    list: (data) => http.post('/dataflow/operator/list', data),
    add: (data) => http.post('/dataflow/operator/add', data),
    edit: (data) => http.post('/dataflow/operator/update', data),
    delete: (operatorID) => http.post('/dataflow/operator/delete', { operatorID }),
  };
  Api.Data.Employee = {
    list: (data) => http.post('/dataflow/employee/list', data),
    add: (data) => http.post('/dataflow/employee/add', data),
    edit: (data) => http.post('/dataflow/employee/update', data),
    delete: (employeeID) => http.post('/dataflow/employee/delete', { employeeID }),
  };
  Api.Data.VideoGroup = {
    listSub: (data) => http.post('/dataflow/videogroup/listsub', data),
    add: (data) => http.post('/dataflow/videogroup/add', data),
    edit: (data) => http.post('/dataflow/videogroup/update', data),
    delete: (groupID) => http.post('/dataflow/videogroup/delete', { groupID }),
  };
  Api.Data.Video = {
    list: (data) => http.post('/dataflow/videoinfo/list', data),
    add: (data) => http.post('/dataflow/videoinfo/add', data),
    edit: (data) => http.post('/dataflow/videoinfo/update', data),
    delete: (videoID) => http.post('/dataflow/videoinfo/delete', { videoID }),
  };
  Api.Data.Module = {
    list: (data) => http.get('/dataflow/module/list', data),
    add: (data) => http.post('/dataflow/module/add', data),
    edit: (data) => http.post('/dataflow/module/update', data),
    delete: (ID) => http.post('/dataflow/module/delete', { ID }),
  };
  Api.Data.SoftPhone = {
    list: (data) => http.post('/dataflow/softphone/list', data),
    add: (data) => http.post('/dataflow/softphone/add', data),
    edit: (data) => http.post('/dataflow/softphone/update', data),
    delete: (ID) => http.post('/dataflow/softphone/delete', { ID }),
  };
  Api.Data.Blacklist = {
    list: (data) => http.post('/dataflow/blacklist/list', data),
    add: (data) => http.post('/dataflow/blacklist/add', data),
    edit: (data) => http.post('/dataflow/blacklist/update', data),
    delete: (ID) => http.post('/dataflow/blacklist/delete', { ID }),
  };

  const uploadFile = (api, options) => {
    return new Promise((resolve, reject) => {
      let formData = new FormData();
      formData.append('file', options.file);
      http
        .post(api, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
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

  Api.File.VoiceFile = {
    list: (data) => http.post('/fileflow/voicefile/list', data),
    upload: (options) => uploadFile('/fileflow/voicefile/upload', options),
    edit: (data) => http.post('/fileflow/voicefile/update', data),
    delete: (fileid) => http.post('/fileflow/voicefile/delete', { fileid }),
  };
  Api.File.SmsFile = {
    upload: (options) => uploadFile('/fileflow/smsfile/upload', options),
    download: (filename) => http.get(`/fileflow/smsfile/download/${filename}`),
  };
  Api.File.FaxFile = {
    upload: (options) => uploadFile('/fileflow/faxfile/upload', options),
    download: (filename) => http.get(`/fileflow/faxfile/download/${filename}`),
  };

  return DispRTC;
});
