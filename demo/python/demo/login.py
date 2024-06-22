import requests,json,threading,time
from requests.packages import urllib3

# 关闭警告
urllib3.disable_warnings()

from datetime import datetime
from util.Signature import Signature
from util.HTTPAPI import HTTP

domain = input("请输入登录的服务器地址(默认120.26.125.181):")
http = HTTP(domain)
ACCESS_TOKEN = ""

# 登录并返回结果，为空则登录失败
def login(username='',password='') -> dict:
    # username = input("请输入账号名:")
    while not len(username):
        username = input("请输入账号名:")

    # password = input("请输入密码:")
    while not len(password):
        password = input("请输入密码:")

    result = Signature(username,password).getSignature()
    print(f"账号{username}的签名为: {result}")
    data = {
        "user_name": username,
        "signature": result
    }
    print("开始登录...")
    response = http.post(http.URL_LOGIN,data)
    print(f"返回结果为{response.text}")
    
    if response.json().get('code') == http.CODE_SUCCESS:
        print("登录成功")
        return response.json()
    elif response.json().get('code') == http.CODE_USERNAME_OR_PASSWORD_ERROR:
        print("账号或密码错误")
        
    return {}

# 新开个线程进行token保活
def __request_updateToken(token):
    time.sleep(15)
    while True:
        print("保活中...")
        response = http.post(http.URL_UPDATETOKEN,header={'access_token':token})
        print(response.json())
        token = response.json().get('data').get('access_token')
        time.sleep(30)

def updateToken(token):
    print("开始保活...")
    thread = threading.Thread(target=__request_updateToken,args=(token,))
    thread.start()    
    
def main():
    result = login()
    while not len(result):
        result = login()

    ACCESS_TOKEN = result.get('data').get('access_token')
    updateToken(ACCESS_TOKEN)
    print("next run")


if __name__ == '__main__':
    main()
