from datetime import datetime
import base64
from Crypto.Cipher import AES


class Signature:
    # 参数说明 username为用户名、password为密码、time可为空，为空时自动获取当前时间
    def __init__(self,username,password,time=None):
        self.__username = username
        self.__password = password
        if time:
            self.__time = str(time)
        else:
            self.__time = datetime.now().strftime("%Y%m%d%H%M%S")

    def __splitString(self):
        return f"{self.__username}@{self.__password}@{self.__time}"


    # 确保 password 长度为16位
    def __pad_password(self,password):
        return password.rjust(16, '0')

    # 加密方法
    def __encryptString(self,splitString):
        password_padded = self.__pad_password(self.__password).encode('utf-8')

        padding = lambda s: s + (16 -len(s) %16) *chr(16 -len(s) %16)

        cryptos = AES.new(password_padded,AES.MODE_ECB) # 使用ECB模式

        cipher_text = cryptos.encrypt(padding(splitString).encode("utf-8"))
        
        return base64.b64encode(cipher_text).decode("utf-8")
    
    #  获取signature
    def getSignature(self):
        splitString = self.__splitString()
        encryptString = self.__encryptString(splitString)
        secondEncrypt = base64.b64encode((f"{self.__username:}:{encryptString}").encode('utf-8')).decode('utf-8')
        return secondEncrypt
 
