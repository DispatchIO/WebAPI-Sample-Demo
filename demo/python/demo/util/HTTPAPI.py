import requests,json

class HTTP:
  def __init__(self,domain=None) -> None:
    if domain == '' or domain == None:
      self.DOMAIN = "https://120.26.125.181"
    else:
      self.DOMAIN = "https://"+domain
    # self.DOMAIN = "https://120.26.125.181"
    self.URL_LOGIN = self.DOMAIN+"/api/v2/account/sign_in"
    self.URL_UPDATETOKEN = self.DOMAIN+"/api/v2/account/update_token"
    """
    下列开始为状态码（逐步增加...）
    """
    self.CODE_SUCCESS = 200 # 成功
    self.CODE_USERNAME_OR_PASSWORD_ERROR = 406 # 账号或密码错误。


  def post(self,url,data=None,header=None)->requests.models.Response:
    if header:
      header['Content-Type'] = 'application/json'
    else:
      header = {'Content-Type': 'application/json'}
    if data:
      response = requests.post(url, data=json.dumps(data), headers=header,verify=False)
    else:
      response = requests.post(url, headers=header,verify=False)
    # print(type(response))
    return response