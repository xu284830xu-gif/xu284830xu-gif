/*
 * password_gen.c —— 命令行随机密码生成器（第一版）
 *
 * 用法：password_gen <长度> [--digits]
 *   --digits  只使用数字
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

int main(int argc, char *argv[])
{
    int len = atoi(argv[1]);
    int digits_only = 0;
    int i;

    /* 解析 --digits 开关 */
    for (i = 2; i < argc; i++) {
        if (strcmp(argv[i], "--digits") == 0) {
            digits_only = 1;
        }
    }

    /* 字符池 */
    const char *pool = digits_only
        ? "0123456789"
        : "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";

    srand((unsigned)time(NULL));

    char buf[128];
    for (i = 0; i < len; i++) {
        buf[i] = pool[rand() % (int)strlen(pool)];
    }
    buf[len] = '\0';

    printf("%s\n", buf);
    return 0;
}
