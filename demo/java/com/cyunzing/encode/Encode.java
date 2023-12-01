package com.cyunzing.encode;

import java.text.SimpleDateFormat;
import java.util.Base64;
import java.util.Date;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;

/**
 * @Author CyunZing
 * @Date Create at 2023/2/16
 */
public class Encode {

    private static final String TAG = "cyunzing";

    /**
     * signature加密
     * @param username
     * @param password
     * @return
     * @throws Exception
     */
    public static String encode(String username, String password,String now_time) throws Exception {
        SimpleDateFormat fn = new SimpleDateFormat("yyyyMMddHHmmss");
        if (now_time == ""){
            now_time = fn.format(new Date());
        }
        // 拼接明文 “username@password@nowdate”
        String init_string = String.format("%s@%s@%s", username, password, now_time);
        System.out.println("第一个步："+init_string);
        String ret = String.format("%s:%s", username, Encrypt(init_string, password));
        System.out.println("第二个步："+ret);
        String encrypt = Base64.getEncoder().encodeToString(ret.getBytes());
        System.out.println("第三个步："+encrypt);
        return encrypt;
    }

    private static String Encrypt(String sSrc, String sKey) throws Exception {
        if (sKey == null) {
            return null;
        }
        // 判断Key是否为16位
        if (sKey.length() != 16) {

            int num = 16 - sKey.length();
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < num; i++) {
                sb.append("0");
            }
            sb.append(sKey);
            sKey = sb.toString();
        }
        byte[] raw = sKey.getBytes("utf-8");

        SecretKeySpec skeySpec = new SecretKeySpec(raw, "AES");
        Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");// "算法/模式/补码方式"
        cipher.init(Cipher.ENCRYPT_MODE, skeySpec);
        byte[] encrypted = cipher.doFinal(sSrc.getBytes("utf-8"));
        
        // 此处使用BASE64做转码功能，同时能起到2次加密的作用。
        String base64String = Base64.getEncoder().encodeToString(encrypted);
        return base64String;
    }
}
