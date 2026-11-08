/*
 * Jembatan JNI minimal antara aplikasi Android dan libnode.
 * Menyalin argumen ke memori bersambung karena libuv membutuhkannya.
 */

#include <jni.h>
#include <string>
#include <cstdlib>
#include <cstring>
#include <cstdio>
#include <unistd.h>
#include <pthread.h>
#include <android/log.h>

#include "node.h"

#define LOG_TAG "MetronuxNode"

#if defined(__arm__)
#define CURRENT_ABI_NAME "armeabi-v7a"
#elif defined(__aarch64__)
#define CURRENT_ABI_NAME "arm64-v8a"
#elif defined(__i386__)
#define CURRENT_ABI_NAME "x86"
#elif defined(__x86_64__)
#define CURRENT_ABI_NAME "x86_64"
#else
#error "ABI tidak dikenal"
#endif

static int pipe_stdout[2];
static int pipe_stderr[2];

static void redirect_stream(int fd, int level) {
  char buffer[2048];
  ssize_t count;
  while ((count = read(fd, buffer, sizeof(buffer) - 1)) > 0) {
    if (buffer[count - 1] == '\n') count -= 1;
    buffer[count] = '\0';
    __android_log_write(level, LOG_TAG, buffer);
  }
}

static void* stdout_thread(void*) {
  redirect_stream(pipe_stdout[0], ANDROID_LOG_INFO);
  return nullptr;
}

static void* stderr_thread(void*) {
  redirect_stream(pipe_stderr[0], ANDROID_LOG_ERROR);
  return nullptr;
}

static int redirect_output() {
  setvbuf(stdout, nullptr, _IONBF, 0);
  if (pipe(pipe_stdout) != 0) return -1;
  dup2(pipe_stdout[1], STDOUT_FILENO);

  setvbuf(stderr, nullptr, _IONBF, 0);
  if (pipe(pipe_stderr) != 0) return -1;
  dup2(pipe_stderr[1], STDERR_FILENO);

  pthread_t out_thread;
  pthread_t err_thread;
  if (pthread_create(&out_thread, nullptr, stdout_thread, nullptr) != 0) return -1;
  pthread_detach(out_thread);
  if (pthread_create(&err_thread, nullptr, stderr_thread, nullptr) != 0) return -1;
  pthread_detach(err_thread);
  return 0;
}

extern "C"
JNIEXPORT jint JNICALL
Java_id_metronux_player_NodeJS_startNodeWithArguments(
    JNIEnv* env,
    jobject,
    jobjectArray arguments,
    jstring nodePath,
    jboolean redirectOutput) {

  const char* path = env->GetStringUTFChars(nodePath, nullptr);
  setenv("NODE_PATH", path, 1);
  env->ReleaseStringUTFChars(nodePath, path);

  jsize count = env->GetArrayLength(arguments);
  int total = 0;
  for (jsize i = 0; i < count; ++i) {
    jstring arg = (jstring)env->GetObjectArrayElement(arguments, i);
    const char* value = env->GetStringUTFChars(arg, nullptr);
    total += static_cast<int>(strlen(value)) + 1;
    env->ReleaseStringUTFChars(arg, value);
    env->DeleteLocalRef(arg);
  }

  char* buffer = static_cast<char*>(calloc(total, sizeof(char)));
  char** argv = static_cast<char**>(calloc(count, sizeof(char*)));
  char* position = buffer;

  for (jsize i = 0; i < count; ++i) {
    jstring arg = (jstring)env->GetObjectArrayElement(arguments, i);
    const char* value = env->GetStringUTFChars(arg, nullptr);
    strcpy(position, value);
    env->ReleaseStringUTFChars(arg, value);
    env->DeleteLocalRef(arg);
    argv[i] = position;
    position += strlen(position) + 1;
  }

  if (redirectOutput) {
    if (redirect_output() == -1) {
      __android_log_write(ANDROID_LOG_ERROR, LOG_TAG, "Gagal mengalihkan output ke logcat");
    }
  }

  int code = node::Start(static_cast<int>(count), argv);
  free(argv);
  free(buffer);
  return code;
}

extern "C"
JNIEXPORT jstring JNICALL
Java_id_metronux_player_NodeJS_getCurrentABIName(JNIEnv* env, jobject) {
  return env->NewStringUTF(CURRENT_ABI_NAME);
}
