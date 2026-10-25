"""白名单测试用的最小脚本：只打印一行，方便断言输出。"""
import sys

print("whitelist-ok")
if len(sys.argv) > 1:
    print("args:", ",".join(sys.argv[1:]))
