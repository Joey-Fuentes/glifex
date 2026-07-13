// rustbuild/wasi/wasi_defs.ts
var CLOCKID_REALTIME = 0;
var CLOCKID_MONOTONIC = 1;
var ERRNO_SUCCESS = 0;
var ERRNO_BADF = 8;
var ERRNO_EXIST = 20;
var ERRNO_INVAL = 28;
var ERRNO_ISDIR = 31;
var ERRNO_NAMETOOLONG = 37;
var ERRNO_NOENT = 44;
var ERRNO_NOSYS = 52;
var ERRNO_NOTDIR = 54;
var ERRNO_NOTEMPTY = 55;
var ERRNO_NOTSUP = 58;
var ERRNO_PERM = 63;
var ERRNO_NOTCAPABLE = 76;
var RIGHTS_FD_DATASYNC = 1 << 0;
var RIGHTS_FD_READ = 1 << 1;
var RIGHTS_FD_SEEK = 1 << 2;
var RIGHTS_FD_FDSTAT_SET_FLAGS = 1 << 3;
var RIGHTS_FD_SYNC = 1 << 4;
var RIGHTS_FD_TELL = 1 << 5;
var RIGHTS_FD_WRITE = 1 << 6;
var RIGHTS_FD_ADVISE = 1 << 7;
var RIGHTS_FD_ALLOCATE = 1 << 8;
var RIGHTS_PATH_CREATE_DIRECTORY = 1 << 9;
var RIGHTS_PATH_CREATE_FILE = 1 << 10;
var RIGHTS_PATH_LINK_SOURCE = 1 << 11;
var RIGHTS_PATH_LINK_TARGET = 1 << 12;
var RIGHTS_PATH_OPEN = 1 << 13;
var RIGHTS_FD_READDIR = 1 << 14;
var RIGHTS_PATH_READLINK = 1 << 15;
var RIGHTS_PATH_RENAME_SOURCE = 1 << 16;
var RIGHTS_PATH_RENAME_TARGET = 1 << 17;
var RIGHTS_PATH_FILESTAT_GET = 1 << 18;
var RIGHTS_PATH_FILESTAT_SET_SIZE = 1 << 19;
var RIGHTS_PATH_FILESTAT_SET_TIMES = 1 << 20;
var RIGHTS_FD_FILESTAT_GET = 1 << 21;
var RIGHTS_FD_FILESTAT_SET_SIZE = 1 << 22;
var RIGHTS_FD_FILESTAT_SET_TIMES = 1 << 23;
var RIGHTS_PATH_SYMLINK = 1 << 24;
var RIGHTS_PATH_REMOVE_DIRECTORY = 1 << 25;
var RIGHTS_PATH_UNLINK_FILE = 1 << 26;
var RIGHTS_POLL_FD_READWRITE = 1 << 27;
var RIGHTS_SOCK_SHUTDOWN = 1 << 28;
var Iovec = class _Iovec {
  //@ts-ignore strictPropertyInitialization
  buf;
  //@ts-ignore strictPropertyInitialization
  buf_len;
  static read_bytes(view, ptr) {
    const iovec = new _Iovec();
    iovec.buf = view.getUint32(ptr, true);
    iovec.buf_len = view.getUint32(ptr + 4, true);
    return iovec;
  }
  static read_bytes_array(view, ptr, len) {
    const iovecs = [];
    for (let i = 0; i < len; i++) {
      iovecs.push(_Iovec.read_bytes(view, ptr + 8 * i));
    }
    return iovecs;
  }
};
var Ciovec = class _Ciovec {
  //@ts-ignore strictPropertyInitialization
  buf;
  //@ts-ignore strictPropertyInitialization
  buf_len;
  static read_bytes(view, ptr) {
    const iovec = new _Ciovec();
    iovec.buf = view.getUint32(ptr, true);
    iovec.buf_len = view.getUint32(ptr + 4, true);
    return iovec;
  }
  static read_bytes_array(view, ptr, len) {
    const iovecs = [];
    for (let i = 0; i < len; i++) {
      iovecs.push(_Ciovec.read_bytes(view, ptr + 8 * i));
    }
    return iovecs;
  }
};
var WHENCE_SET = 0;
var WHENCE_CUR = 1;
var WHENCE_END = 2;
var FILETYPE_DIRECTORY = 3;
var FILETYPE_REGULAR_FILE = 4;
var Dirent = class {
  d_next;
  d_ino = 0n;
  d_namlen;
  d_type;
  dir_name;
  constructor(next_cookie, name, type) {
    const encoded_name = new TextEncoder().encode(name);
    this.d_next = next_cookie;
    this.d_namlen = encoded_name.byteLength;
    this.d_type = type;
    this.dir_name = encoded_name;
  }
  head_length() {
    return 24;
  }
  name_length() {
    return this.dir_name.byteLength;
  }
  write_head_bytes(view, ptr) {
    view.setBigUint64(ptr, this.d_next, true);
    view.setBigUint64(ptr + 8, this.d_ino, true);
    view.setUint32(ptr + 16, this.dir_name.length, true);
    view.setUint8(ptr + 20, this.d_type);
  }
  write_name_bytes(view8, ptr, buf_len) {
    view8.set(
      this.dir_name.slice(0, Math.min(this.dir_name.byteLength, buf_len)),
      ptr
    );
  }
};
var FDFLAGS_APPEND = 1 << 0;
var FDFLAGS_DSYNC = 1 << 1;
var FDFLAGS_NONBLOCK = 1 << 2;
var FDFLAGS_RSYNC = 1 << 3;
var FDFLAGS_SYNC = 1 << 4;
var Fdstat = class {
  fs_filetype;
  fs_flags;
  fs_rights_base = 0n;
  fs_rights_inherited = 0n;
  constructor(filetype, flags) {
    this.fs_filetype = filetype;
    this.fs_flags = flags;
  }
  write_bytes(view, ptr) {
    view.setUint8(ptr, this.fs_filetype);
    view.setUint16(ptr + 2, this.fs_flags, true);
    view.setBigUint64(ptr + 8, this.fs_rights_base, true);
    view.setBigUint64(ptr + 16, this.fs_rights_inherited, true);
  }
};
var FSTFLAGS_ATIM = 1 << 0;
var FSTFLAGS_ATIM_NOW = 1 << 1;
var FSTFLAGS_MTIM = 1 << 2;
var FSTFLAGS_MTIM_NOW = 1 << 3;
var OFLAGS_CREAT = 1 << 0;
var OFLAGS_DIRECTORY = 1 << 1;
var OFLAGS_EXCL = 1 << 2;
var OFLAGS_TRUNC = 1 << 3;
var Filestat = class {
  dev = 0n;
  ino = 0n;
  filetype;
  nlink = 0n;
  size;
  atim = 0n;
  mtim = 0n;
  ctim = 0n;
  constructor(filetype, size) {
    this.filetype = filetype;
    this.size = size;
  }
  write_bytes(view, ptr) {
    view.setBigUint64(ptr, this.dev, true);
    view.setBigUint64(ptr + 8, this.ino, true);
    view.setUint8(ptr + 16, this.filetype);
    view.setBigUint64(ptr + 24, this.nlink, true);
    view.setBigUint64(ptr + 32, this.size, true);
    view.setBigUint64(ptr + 38, this.atim, true);
    view.setBigUint64(ptr + 46, this.mtim, true);
    view.setBigUint64(ptr + 52, this.ctim, true);
  }
};
var EVENTRWFLAGS_FD_READWRITE_HANGUP = 1 << 0;
var SUBCLOCKFLAGS_SUBSCRIPTION_CLOCK_ABSTIME = 1 << 0;
var RIFLAGS_RECV_PEEK = 1 << 0;
var RIFLAGS_RECV_WAITALL = 1 << 1;
var ROFLAGS_RECV_DATA_TRUNCATED = 1 << 0;
var SDFLAGS_RD = 1 << 0;
var SDFLAGS_WR = 1 << 1;
var PREOPENTYPE_DIR = 0;
var PrestatDir = class {
  pr_name;
  constructor(name) {
    this.pr_name = new TextEncoder().encode(name);
  }
  write_bytes(view, ptr) {
    view.setUint32(ptr, this.pr_name.byteLength, true);
  }
};
var Prestat = class _Prestat {
  //@ts-ignore strictPropertyInitialization
  tag;
  //@ts-ignore strictPropertyInitialization
  inner;
  static dir(name) {
    const prestat = new _Prestat();
    prestat.tag = PREOPENTYPE_DIR;
    prestat.inner = new PrestatDir(name);
    return prestat;
  }
  write_bytes(view, ptr) {
    view.setUint32(ptr, this.tag, true);
    this.inner.write_bytes(view, ptr + 4);
  }
};

// rustbuild/wasi/debug.ts
var Debug = class {
  constructor(isEnabled) {
    this.isEnabled = isEnabled;
    this.log = createLogger(
      isEnabled,
      this.prefix
    );
  }
  isEnabled;
  prefix = "wasi:";
  log;
  // Recreate the logger function with the new enabled state.
  enable(enabled) {
    this.log = createLogger(
      enabled === void 0 ? true : enabled,
      this.prefix
    );
  }
  // Getter for the private isEnabled property.
  get enabled() {
    return this.isEnabled;
  }
};
function createLogger(enabled, prefix) {
  if (enabled) {
    const a = console.log.bind(console, "%c%s", "color: #265BA0", prefix);
    return a;
  } else {
    return () => {
    };
  }
}
var debug = new Debug(false);

// rustbuild/wasi/wasi.ts
var WASIProcExit = class extends Error {
  constructor(code) {
    super("exit with exit code " + code);
    this.code = code;
  }
  code;
};
var WASI = class {
  args = [];
  env = [];
  fds = [];
  inst;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wasiImport;
  /// Start a WASI command
  start(instance) {
    this.inst = instance;
    try {
      instance.exports._start();
      return 0;
    } catch (e) {
      if (e instanceof WASIProcExit) {
        return e.code;
      } else {
        throw e;
      }
    }
  }
  /// Initialize a WASI reactor
  initialize(instance) {
    this.inst = instance;
    if (instance.exports._initialize) {
      instance.exports._initialize();
    }
  }
  constructor(args, env, fds, options = {}) {
    debug.enable(options.debug);
    this.args = args;
    this.env = env;
    this.fds = fds;
    this.inst = {
      exports: {
        memory: new WebAssembly.Memory({ initial: 0, maximum: 0, shared: false })
      }
    };
    const self2 = this;
    this.wasiImport = {
      args_sizes_get(argc, argv_buf_size) {
        const buffer = new DataView(self2.inst.exports.memory.buffer);
        buffer.setUint32(argc, self2.args.length, true);
        let buf_size = 0;
        for (const arg of self2.args) {
          buf_size += arg.length + 1;
        }
        buffer.setUint32(argv_buf_size, buf_size, true);
        debug.log(
          buffer.getUint32(argc, true),
          buffer.getUint32(argv_buf_size, true)
        );
        return 0;
      },
      args_get(argv, argv_buf) {
        const buffer = new DataView(self2.inst.exports.memory.buffer);
        const buffer8 = new Uint8Array(self2.inst.exports.memory.buffer);
        const orig_argv_buf = argv_buf;
        for (let i = 0; i < self2.args.length; i++) {
          buffer.setUint32(argv, argv_buf, true);
          argv += 4;
          const arg = new TextEncoder().encode(self2.args[i]);
          buffer8.set(arg, argv_buf);
          buffer.setUint8(argv_buf + arg.length, 0);
          argv_buf += arg.length + 1;
        }
        if (debug.enabled) {
          debug.log(
            new TextDecoder("utf-8").decode(
              buffer8.slice(orig_argv_buf, argv_buf)
            )
          );
        }
        return 0;
      },
      environ_sizes_get(environ_count, environ_size) {
        const buffer = new DataView(self2.inst.exports.memory.buffer);
        buffer.setUint32(environ_count, self2.env.length, true);
        let buf_size = 0;
        for (const environ of self2.env) {
          buf_size += environ.length + 1;
        }
        buffer.setUint32(environ_size, buf_size, true);
        debug.log(
          buffer.getUint32(environ_count, true),
          buffer.getUint32(environ_size, true)
        );
        return 0;
      },
      environ_get(environ, environ_buf) {
        const buffer = new DataView(self2.inst.exports.memory.buffer);
        const buffer8 = new Uint8Array(self2.inst.exports.memory.buffer);
        const orig_environ_buf = environ_buf;
        for (let i = 0; i < self2.env.length; i++) {
          buffer.setUint32(environ, environ_buf, true);
          environ += 4;
          const e = new TextEncoder().encode(self2.env[i]);
          buffer8.set(e, environ_buf);
          buffer.setUint8(environ_buf + e.length, 0);
          environ_buf += e.length + 1;
        }
        if (debug.enabled) {
          debug.log(
            new TextDecoder("utf-8").decode(
              buffer8.slice(orig_environ_buf, environ_buf)
            )
          );
        }
        return 0;
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      clock_res_get(id, res_ptr) {
        let resolutionValue;
        switch (id) {
          case CLOCKID_MONOTONIC: {
            resolutionValue = 5000n;
            break;
          }
          case CLOCKID_REALTIME: {
            resolutionValue = 1000000n;
            break;
          }
          default:
            return ERRNO_NOSYS;
        }
        const view = new DataView(self2.inst.exports.memory.buffer);
        view.setBigUint64(res_ptr, resolutionValue, true);
        return ERRNO_SUCCESS;
      },
      clock_time_get(id, precision, time) {
        const buffer = new DataView(self2.inst.exports.memory.buffer);
        if (id === CLOCKID_REALTIME) {
          buffer.setBigUint64(
            time,
            BigInt((/* @__PURE__ */ new Date()).getTime()) * 1000000n,
            true
          );
        } else if (id == CLOCKID_MONOTONIC) {
          let monotonic_time;
          try {
            monotonic_time = BigInt(Math.round(performance.now() * 1e6));
          } catch (e) {
            monotonic_time = 0n;
          }
          buffer.setBigUint64(time, monotonic_time, true);
        } else {
          buffer.setBigUint64(time, 0n, true);
        }
        return 0;
      },
      fd_advise(fd, offset, len, advice) {
        if (self2.fds[fd] != void 0) {
          return ERRNO_SUCCESS;
        } else {
          return ERRNO_BADF;
        }
      },
      fd_allocate(fd, offset, len) {
        if (self2.fds[fd] !== void 0) {
          return self2.fds[fd].fd_allocate(offset, len);
        } else {
          return ERRNO_BADF;
        }
      },
      fd_close(fd) {
        if (self2.fds[fd] !== void 0) {
          const ret = self2.fds[fd].fd_close();
          self2.fds[fd] = void 0;
          return ret;
        } else {
          return ERRNO_BADF;
        }
      },
      fd_datasync(fd) {
        if (self2.fds[fd] != void 0) {
          return self2.fds[fd].fd_sync();
        } else {
          return ERRNO_BADF;
        }
      },
      fd_fdstat_get(fd, fdstat_ptr) {
        if (self2.fds[fd] != void 0) {
          const { ret, fdstat } = self2.fds[fd].fd_fdstat_get();
          if (fdstat != null) {
            fdstat.write_bytes(
              new DataView(self2.inst.exports.memory.buffer),
              fdstat_ptr
            );
          }
          return ret;
        } else {
          return ERRNO_BADF;
        }
      },
      fd_fdstat_set_flags(fd, flags) {
        if (self2.fds[fd] != void 0) {
          return self2.fds[fd].fd_fdstat_set_flags(flags);
        } else {
          return ERRNO_BADF;
        }
      },
      fd_fdstat_set_rights(fd, fs_rights_base, fs_rights_inheriting) {
        if (self2.fds[fd] != void 0) {
          return self2.fds[fd].fd_fdstat_set_rights(
            fs_rights_base,
            fs_rights_inheriting
          );
        } else {
          return ERRNO_BADF;
        }
      },
      fd_filestat_get(fd, filestat_ptr) {
        if (self2.fds[fd] != void 0) {
          const { ret, filestat } = self2.fds[fd].fd_filestat_get();
          if (filestat != null) {
            filestat.write_bytes(
              new DataView(self2.inst.exports.memory.buffer),
              filestat_ptr
            );
          }
          return ret;
        } else {
          return ERRNO_BADF;
        }
      },
      fd_filestat_set_size(fd, size) {
        if (self2.fds[fd] != void 0) {
          return self2.fds[fd].fd_filestat_set_size(size);
        } else {
          return ERRNO_BADF;
        }
      },
      fd_filestat_set_times(fd, atim, mtim, fst_flags) {
        if (self2.fds[fd] != void 0) {
          return self2.fds[fd].fd_filestat_set_times(atim, mtim, fst_flags);
        } else {
          return ERRNO_BADF;
        }
      },
      fd_pread(fd, iovs_ptr, iovs_len, offset, nread_ptr) {
        const buffer = new DataView(self2.inst.exports.memory.buffer);
        const buffer8 = new Uint8Array(self2.inst.exports.memory.buffer);
        if (self2.fds[fd] != void 0) {
          const iovecs = Iovec.read_bytes_array(
            buffer,
            iovs_ptr,
            iovs_len
          );
          let nread = 0;
          for (const iovec of iovecs) {
            const { ret, data } = self2.fds[fd].fd_pread(iovec.buf_len, offset);
            if (ret != ERRNO_SUCCESS) {
              buffer.setUint32(nread_ptr, nread, true);
              return ret;
            }
            buffer8.set(data, iovec.buf);
            nread += data.length;
            offset += BigInt(data.length);
            if (data.length != iovec.buf_len) {
              break;
            }
          }
          buffer.setUint32(nread_ptr, nread, true);
          return ERRNO_SUCCESS;
        } else {
          return ERRNO_BADF;
        }
      },
      fd_prestat_get(fd, buf_ptr) {
        const buffer = new DataView(self2.inst.exports.memory.buffer);
        if (self2.fds[fd] != void 0) {
          const { ret, prestat } = self2.fds[fd].fd_prestat_get();
          if (prestat != null) {
            prestat.write_bytes(buffer, buf_ptr);
          }
          return ret;
        } else {
          return ERRNO_BADF;
        }
      },
      fd_prestat_dir_name(fd, path_ptr, path_len) {
        if (self2.fds[fd] != void 0) {
          const { ret, prestat } = self2.fds[fd].fd_prestat_get();
          if (prestat == null) {
            return ret;
          }
          const prestat_dir_name = prestat.inner.pr_name;
          const buffer8 = new Uint8Array(self2.inst.exports.memory.buffer);
          buffer8.set(prestat_dir_name.slice(0, path_len), path_ptr);
          return prestat_dir_name.byteLength > path_len ? ERRNO_NAMETOOLONG : ERRNO_SUCCESS;
        } else {
          return ERRNO_BADF;
        }
      },
      fd_pwrite(fd, iovs_ptr, iovs_len, offset, nwritten_ptr) {
        const buffer = new DataView(self2.inst.exports.memory.buffer);
        const buffer8 = new Uint8Array(self2.inst.exports.memory.buffer);
        if (self2.fds[fd] != void 0) {
          const iovecs = Ciovec.read_bytes_array(
            buffer,
            iovs_ptr,
            iovs_len
          );
          let nwritten = 0;
          for (const iovec of iovecs) {
            const data = buffer8.slice(iovec.buf, iovec.buf + iovec.buf_len);
            const { ret, nwritten: nwritten_part } = self2.fds[fd].fd_pwrite(
              data,
              offset
            );
            if (ret != ERRNO_SUCCESS) {
              buffer.setUint32(nwritten_ptr, nwritten, true);
              return ret;
            }
            nwritten += nwritten_part;
            offset += BigInt(nwritten_part);
            if (nwritten_part != data.byteLength) {
              break;
            }
          }
          buffer.setUint32(nwritten_ptr, nwritten, true);
          return ERRNO_SUCCESS;
        } else {
          return ERRNO_BADF;
        }
      },
      fd_read(fd, iovs_ptr, iovs_len, nread_ptr) {
        const buffer = new DataView(self2.inst.exports.memory.buffer);
        const buffer8 = new Uint8Array(self2.inst.exports.memory.buffer);
        if (self2.fds[fd] != void 0) {
          const iovecs = Iovec.read_bytes_array(
            buffer,
            iovs_ptr,
            iovs_len
          );
          let nread = 0;
          for (const iovec of iovecs) {
            const { ret, data } = self2.fds[fd].fd_read(iovec.buf_len);
            if (ret != ERRNO_SUCCESS) {
              buffer.setUint32(nread_ptr, nread, true);
              return ret;
            }
            buffer8.set(data, iovec.buf);
            nread += data.length;
            if (data.length != iovec.buf_len) {
              break;
            }
          }
          buffer.setUint32(nread_ptr, nread, true);
          return ERRNO_SUCCESS;
        } else {
          return ERRNO_BADF;
        }
      },
      fd_readdir(fd, buf, buf_len, cookie, bufused_ptr) {
        const buffer = new DataView(self2.inst.exports.memory.buffer);
        const buffer8 = new Uint8Array(self2.inst.exports.memory.buffer);
        if (self2.fds[fd] != void 0) {
          let bufused = 0;
          while (true) {
            const { ret, dirent } = self2.fds[fd].fd_readdir_single(cookie);
            if (ret != 0) {
              buffer.setUint32(bufused_ptr, bufused, true);
              return ret;
            }
            if (dirent == null) {
              break;
            }
            if (buf_len - bufused < dirent.head_length()) {
              bufused = buf_len;
              break;
            }
            const head_bytes = new ArrayBuffer(dirent.head_length());
            dirent.write_head_bytes(new DataView(head_bytes), 0);
            buffer8.set(
              new Uint8Array(head_bytes).slice(
                0,
                Math.min(head_bytes.byteLength, buf_len - bufused)
              ),
              buf
            );
            buf += dirent.head_length();
            bufused += dirent.head_length();
            if (buf_len - bufused < dirent.name_length()) {
              bufused = buf_len;
              break;
            }
            dirent.write_name_bytes(buffer8, buf, buf_len - bufused);
            buf += dirent.name_length();
            bufused += dirent.name_length();
            cookie = dirent.d_next;
          }
          buffer.setUint32(bufused_ptr, bufused, true);
          return 0;
        } else {
          return ERRNO_BADF;
        }
      },
      fd_renumber(fd, to) {
        if (self2.fds[fd] != void 0 && self2.fds[to] != void 0) {
          const ret = self2.fds[to].fd_close();
          if (ret != 0) {
            return ret;
          }
          self2.fds[to] = self2.fds[fd];
          self2.fds[fd] = void 0;
          return 0;
        } else {
          return ERRNO_BADF;
        }
      },
      fd_seek(fd, offset, whence, offset_out_ptr) {
        const buffer = new DataView(self2.inst.exports.memory.buffer);
        if (self2.fds[fd] != void 0) {
          const { ret, offset: offset_out } = self2.fds[fd].fd_seek(
            offset,
            whence
          );
          buffer.setBigInt64(offset_out_ptr, offset_out, true);
          return ret;
        } else {
          return ERRNO_BADF;
        }
      },
      fd_sync(fd) {
        if (self2.fds[fd] != void 0) {
          return self2.fds[fd].fd_sync();
        } else {
          return ERRNO_BADF;
        }
      },
      fd_tell(fd, offset_ptr) {
        const buffer = new DataView(self2.inst.exports.memory.buffer);
        if (self2.fds[fd] != void 0) {
          const { ret, offset } = self2.fds[fd].fd_tell();
          buffer.setBigUint64(offset_ptr, offset, true);
          return ret;
        } else {
          return ERRNO_BADF;
        }
      },
      fd_write(fd, iovs_ptr, iovs_len, nwritten_ptr) {
        const buffer = new DataView(self2.inst.exports.memory.buffer);
        const buffer8 = new Uint8Array(self2.inst.exports.memory.buffer);
        if (self2.fds[fd] != void 0) {
          const iovecs = Ciovec.read_bytes_array(
            buffer,
            iovs_ptr,
            iovs_len
          );
          let nwritten = 0;
          for (const iovec of iovecs) {
            const data = buffer8.slice(iovec.buf, iovec.buf + iovec.buf_len);
            const { ret, nwritten: nwritten_part } = self2.fds[fd].fd_write(data);
            if (ret != ERRNO_SUCCESS) {
              buffer.setUint32(nwritten_ptr, nwritten, true);
              return ret;
            }
            nwritten += nwritten_part;
            if (nwritten_part != data.byteLength) {
              break;
            }
          }
          buffer.setUint32(nwritten_ptr, nwritten, true);
          return ERRNO_SUCCESS;
        } else {
          return ERRNO_BADF;
        }
      },
      path_create_directory(fd, path_ptr, path_len) {
        const buffer8 = new Uint8Array(self2.inst.exports.memory.buffer);
        if (self2.fds[fd] != void 0) {
          const path = new TextDecoder("utf-8").decode(
            buffer8.slice(path_ptr, path_ptr + path_len)
          );
          return self2.fds[fd].path_create_directory(path);
        } else {
          return ERRNO_BADF;
        }
      },
      path_filestat_get(fd, flags, path_ptr, path_len, filestat_ptr) {
        const buffer = new DataView(self2.inst.exports.memory.buffer);
        const buffer8 = new Uint8Array(self2.inst.exports.memory.buffer);
        if (self2.fds[fd] != void 0) {
          const path = new TextDecoder("utf-8").decode(
            buffer8.slice(path_ptr, path_ptr + path_len)
          );
          const { ret, filestat } = self2.fds[fd].path_filestat_get(flags, path);
          if (filestat != null) {
            filestat.write_bytes(buffer, filestat_ptr);
          }
          return ret;
        } else {
          return ERRNO_BADF;
        }
      },
      path_filestat_set_times(fd, flags, path_ptr, path_len, atim, mtim, fst_flags) {
        const buffer8 = new Uint8Array(self2.inst.exports.memory.buffer);
        if (self2.fds[fd] != void 0) {
          const path = new TextDecoder("utf-8").decode(
            buffer8.slice(path_ptr, path_ptr + path_len)
          );
          return self2.fds[fd].path_filestat_set_times(
            flags,
            path,
            atim,
            mtim,
            fst_flags
          );
        } else {
          return ERRNO_BADF;
        }
      },
      path_link(old_fd, old_flags, old_path_ptr, old_path_len, new_fd, new_path_ptr, new_path_len) {
        const buffer8 = new Uint8Array(self2.inst.exports.memory.buffer);
        if (self2.fds[old_fd] != void 0 && self2.fds[new_fd] != void 0) {
          const old_path = new TextDecoder("utf-8").decode(
            buffer8.slice(old_path_ptr, old_path_ptr + old_path_len)
          );
          const new_path = new TextDecoder("utf-8").decode(
            buffer8.slice(new_path_ptr, new_path_ptr + new_path_len)
          );
          const { ret, inode_obj } = self2.fds[old_fd].path_lookup(
            old_path,
            old_flags
          );
          if (inode_obj == null) {
            return ret;
          }
          return self2.fds[new_fd].path_link(new_path, inode_obj, false);
        } else {
          return ERRNO_BADF;
        }
      },
      path_open(fd, dirflags, path_ptr, path_len, oflags, fs_rights_base, fs_rights_inheriting, fd_flags, opened_fd_ptr) {
        const buffer = new DataView(self2.inst.exports.memory.buffer);
        const buffer8 = new Uint8Array(self2.inst.exports.memory.buffer);
        if (self2.fds[fd] != void 0) {
          const path = new TextDecoder("utf-8").decode(
            buffer8.slice(path_ptr, path_ptr + path_len)
          );
          debug.log(path);
          const { ret, fd_obj } = self2.fds[fd].path_open(
            dirflags,
            path,
            oflags,
            fs_rights_base,
            fs_rights_inheriting,
            fd_flags
          );
          if (ret != 0) {
            return ret;
          }
          self2.fds.push(fd_obj || void 0);
          const opened_fd = self2.fds.length - 1;
          buffer.setUint32(opened_fd_ptr, opened_fd, true);
          return 0;
        } else {
          return ERRNO_BADF;
        }
      },
      path_readlink(fd, path_ptr, path_len, buf_ptr, buf_len, nread_ptr) {
        const buffer = new DataView(self2.inst.exports.memory.buffer);
        const buffer8 = new Uint8Array(self2.inst.exports.memory.buffer);
        if (self2.fds[fd] != void 0) {
          const path = new TextDecoder("utf-8").decode(
            buffer8.slice(path_ptr, path_ptr + path_len)
          );
          debug.log(path);
          const { ret, data } = self2.fds[fd].path_readlink(path);
          if (data != null) {
            const data_buf = new TextEncoder().encode(data);
            if (data_buf.length > buf_len) {
              buffer.setUint32(nread_ptr, 0, true);
              return ERRNO_BADF;
            }
            buffer8.set(data_buf, buf_ptr);
            buffer.setUint32(nread_ptr, data_buf.length, true);
          }
          return ret;
        } else {
          return ERRNO_BADF;
        }
      },
      path_remove_directory(fd, path_ptr, path_len) {
        const buffer8 = new Uint8Array(self2.inst.exports.memory.buffer);
        if (self2.fds[fd] != void 0) {
          const path = new TextDecoder("utf-8").decode(
            buffer8.slice(path_ptr, path_ptr + path_len)
          );
          return self2.fds[fd].path_remove_directory(path);
        } else {
          return ERRNO_BADF;
        }
      },
      path_rename(fd, old_path_ptr, old_path_len, new_fd, new_path_ptr, new_path_len) {
        const buffer8 = new Uint8Array(self2.inst.exports.memory.buffer);
        if (self2.fds[fd] != void 0 && self2.fds[new_fd] != void 0) {
          const old_path = new TextDecoder("utf-8").decode(
            buffer8.slice(old_path_ptr, old_path_ptr + old_path_len)
          );
          const new_path = new TextDecoder("utf-8").decode(
            buffer8.slice(new_path_ptr, new_path_ptr + new_path_len)
          );
          let { ret, inode_obj } = self2.fds[fd].path_unlink(old_path);
          if (inode_obj == null) {
            return ret;
          }
          ret = self2.fds[new_fd].path_link(new_path, inode_obj, true);
          if (ret != ERRNO_SUCCESS) {
            if (self2.fds[fd].path_link(old_path, inode_obj, true) != ERRNO_SUCCESS) {
              throw "path_link should always return success when relinking an inode back to the original place";
            }
          }
          return ret;
        } else {
          return ERRNO_BADF;
        }
      },
      path_symlink(old_path_ptr, old_path_len, fd, new_path_ptr, new_path_len) {
        const buffer8 = new Uint8Array(self2.inst.exports.memory.buffer);
        if (self2.fds[fd] != void 0) {
          const old_path = new TextDecoder("utf-8").decode(
            buffer8.slice(old_path_ptr, old_path_ptr + old_path_len)
          );
          const new_path = new TextDecoder("utf-8").decode(
            buffer8.slice(new_path_ptr, new_path_ptr + new_path_len)
          );
          return ERRNO_NOTSUP;
        } else {
          return ERRNO_BADF;
        }
      },
      path_unlink_file(fd, path_ptr, path_len) {
        const buffer8 = new Uint8Array(self2.inst.exports.memory.buffer);
        if (self2.fds[fd] != void 0) {
          const path = new TextDecoder("utf-8").decode(
            buffer8.slice(path_ptr, path_ptr + path_len)
          );
          return self2.fds[fd].path_unlink_file(path);
        } else {
          return ERRNO_BADF;
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      poll_oneoff(in_, out, nsubscriptions) {
        throw "async io not supported";
      },
      proc_exit(exit_code) {
        throw new WASIProcExit(exit_code);
      },
      proc_raise(sig) {
        throw "raised signal " + sig;
      },
      sched_yield() {
      },
      random_get(buf, buf_len) {
        const buffer8 = new Uint8Array(
          self2.inst.exports.memory.buffer
        ).subarray(buf, buf + buf_len);
        if ("crypto" in globalThis) {
          for (let i = 0; i < buf_len; i += 65536) {
            crypto.getRandomValues(buffer8.subarray(i, i + 65536));
          }
        } else {
          for (let i = 0; i < buf_len; i++) {
            buffer8[i] = Math.random() * 256 | 0;
          }
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      sock_recv(fd, ri_data, ri_flags) {
        throw "sockets not supported";
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      sock_send(fd, si_data, si_flags) {
        throw "sockets not supported";
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      sock_shutdown(fd, how) {
        throw "sockets not supported";
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      sock_accept(fd, flags) {
        throw "sockets not supported";
      }
    };
  }
};

// rustbuild/wasi/fd.ts
var Fd = class {
  fd_allocate(offset, len) {
    return ERRNO_NOTSUP;
  }
  fd_close() {
    return 0;
  }
  fd_fdstat_get() {
    return { ret: ERRNO_NOTSUP, fdstat: null };
  }
  fd_fdstat_set_flags(flags) {
    return ERRNO_NOTSUP;
  }
  fd_fdstat_set_rights(fs_rights_base, fs_rights_inheriting) {
    return ERRNO_NOTSUP;
  }
  fd_filestat_get() {
    return { ret: ERRNO_NOTSUP, filestat: null };
  }
  fd_filestat_set_size(size) {
    return ERRNO_NOTSUP;
  }
  fd_filestat_set_times(atim, mtim, fst_flags) {
    return ERRNO_NOTSUP;
  }
  fd_pread(size, offset) {
    return { ret: ERRNO_NOTSUP, data: new Uint8Array() };
  }
  fd_prestat_get() {
    return { ret: ERRNO_NOTSUP, prestat: null };
  }
  fd_pwrite(data, offset) {
    return { ret: ERRNO_NOTSUP, nwritten: 0 };
  }
  fd_read(size) {
    return { ret: ERRNO_NOTSUP, data: new Uint8Array() };
  }
  fd_readdir_single(cookie) {
    return { ret: ERRNO_NOTSUP, dirent: null };
  }
  fd_seek(offset, whence) {
    return { ret: ERRNO_NOTSUP, offset: 0n };
  }
  fd_sync() {
    return 0;
  }
  fd_tell() {
    return { ret: ERRNO_NOTSUP, offset: 0n };
  }
  fd_write(data) {
    return { ret: ERRNO_NOTSUP, nwritten: 0 };
  }
  path_create_directory(path) {
    return ERRNO_NOTSUP;
  }
  path_filestat_get(flags, path) {
    return { ret: ERRNO_NOTSUP, filestat: null };
  }
  path_filestat_set_times(flags, path, atim, mtim, fst_flags) {
    return ERRNO_NOTSUP;
  }
  path_link(path, inode, allow_dir) {
    return ERRNO_NOTSUP;
  }
  path_unlink(path) {
    return { ret: ERRNO_NOTSUP, inode_obj: null };
  }
  path_lookup(path, dirflags) {
    return { ret: ERRNO_NOTSUP, inode_obj: null };
  }
  path_open(dirflags, path, oflags, fs_rights_base, fs_rights_inheriting, fd_flags) {
    return { ret: ERRNO_NOTDIR, fd_obj: null };
  }
  path_readlink(path) {
    return { ret: ERRNO_NOTSUP, data: null };
  }
  path_remove_directory(path) {
    return ERRNO_NOTSUP;
  }
  path_rename(old_path, new_fd, new_path) {
    return ERRNO_NOTSUP;
  }
  path_unlink_file(path) {
    return ERRNO_NOTSUP;
  }
};
var Inode = class {
};

// rustbuild/wasi/fs_mem.ts
var OpenFile = class extends Fd {
  file;
  file_pos = 0n;
  constructor(file) {
    super();
    this.file = file;
  }
  fd_allocate(offset, len) {
    if (this.file.size > offset + len) {
    } else {
      const new_data = new Uint8Array(Number(offset + len));
      new_data.set(this.file.data, 0);
      this.file.data = new_data;
    }
    return ERRNO_SUCCESS;
  }
  fd_fdstat_get() {
    return { ret: 0, fdstat: new Fdstat(FILETYPE_REGULAR_FILE, 0) };
  }
  fd_filestat_set_size(size) {
    if (this.file.size > size) {
      this.file.data = new Uint8Array(
        this.file.data.buffer.slice(0, Number(size))
      );
    } else {
      const new_data = new Uint8Array(Number(size));
      new_data.set(this.file.data, 0);
      this.file.data = new_data;
    }
    return ERRNO_SUCCESS;
  }
  fd_read(size) {
    const slice = this.file.data.slice(
      Number(this.file_pos),
      Number(this.file_pos + BigInt(size))
    );
    this.file_pos += BigInt(slice.length);
    return { ret: 0, data: slice };
  }
  fd_pread(size, offset) {
    const slice = this.file.data.slice(
      Number(offset),
      Number(offset + BigInt(size))
    );
    return { ret: 0, data: slice };
  }
  fd_seek(offset, whence) {
    let calculated_offset;
    switch (whence) {
      case WHENCE_SET:
        calculated_offset = offset;
        break;
      case WHENCE_CUR:
        calculated_offset = this.file_pos + offset;
        break;
      case WHENCE_END:
        calculated_offset = BigInt(this.file.data.byteLength) + offset;
        break;
      default:
        return { ret: ERRNO_INVAL, offset: 0n };
    }
    if (calculated_offset < 0) {
      return { ret: ERRNO_INVAL, offset: 0n };
    }
    this.file_pos = calculated_offset;
    return { ret: 0, offset: this.file_pos };
  }
  fd_tell() {
    return { ret: 0, offset: this.file_pos };
  }
  fd_write(data) {
    if (this.file.readonly) return { ret: ERRNO_BADF, nwritten: 0 };
    if (this.file_pos + BigInt(data.byteLength) > this.file.size) {
      const old = this.file.data;
      this.file.data = new Uint8Array(
        Number(this.file_pos + BigInt(data.byteLength))
      );
      this.file.data.set(old);
    }
    this.file.data.set(data, Number(this.file_pos));
    this.file_pos += BigInt(data.byteLength);
    return { ret: 0, nwritten: data.byteLength };
  }
  fd_pwrite(data, offset) {
    if (this.file.readonly) return { ret: ERRNO_BADF, nwritten: 0 };
    if (offset + BigInt(data.byteLength) > this.file.size) {
      const old = this.file.data;
      this.file.data = new Uint8Array(Number(offset + BigInt(data.byteLength)));
      this.file.data.set(old);
    }
    this.file.data.set(data, Number(offset));
    return { ret: 0, nwritten: data.byteLength };
  }
  fd_filestat_get() {
    return { ret: 0, filestat: this.file.stat() };
  }
};
var OpenDirectory = class extends Fd {
  dir;
  constructor(dir) {
    super();
    this.dir = dir;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fd_seek(offset, whence) {
    return { ret: ERRNO_BADF, offset: 0n };
  }
  fd_tell() {
    return { ret: ERRNO_BADF, offset: 0n };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fd_allocate(offset, len) {
    return ERRNO_BADF;
  }
  fd_fdstat_get() {
    return { ret: 0, fdstat: new Fdstat(FILETYPE_DIRECTORY, 0) };
  }
  fd_readdir_single(cookie) {
    if (debug.enabled) {
      debug.log("readdir_single", cookie);
      debug.log(cookie, this.dir.contents.keys());
    }
    if (cookie == 0n) {
      return {
        ret: ERRNO_SUCCESS,
        dirent: new Dirent(1n, ".", FILETYPE_DIRECTORY)
      };
    } else if (cookie == 1n) {
      return {
        ret: ERRNO_SUCCESS,
        dirent: new Dirent(2n, "..", FILETYPE_DIRECTORY)
      };
    }
    if (cookie >= BigInt(this.dir.contents.size) + 2n) {
      return { ret: 0, dirent: null };
    }
    const [name, entry] = Array.from(this.dir.contents.entries())[Number(cookie - 2n)];
    return {
      ret: 0,
      dirent: new Dirent(cookie + 1n, name, entry.stat().filetype)
    };
  }
  path_filestat_get(flags, path_str) {
    const { ret: path_err, path } = Path.from(path_str);
    if (path == null) {
      return { ret: path_err, filestat: null };
    }
    const { ret, entry } = this.dir.get_entry_for_path(path);
    if (entry == null) {
      return { ret, filestat: null };
    }
    return { ret: 0, filestat: entry.stat() };
  }
  path_lookup(path_str, dirflags) {
    const { ret: path_ret, path } = Path.from(path_str);
    if (path == null) {
      return { ret: path_ret, inode_obj: null };
    }
    const { ret, entry } = this.dir.get_entry_for_path(path);
    if (entry == null) {
      return { ret, inode_obj: null };
    }
    return { ret: ERRNO_SUCCESS, inode_obj: entry };
  }
  path_open(dirflags, path_str, oflags, fs_rights_base, fs_rights_inheriting, fd_flags) {
    const { ret: path_ret, path } = Path.from(path_str);
    if (path == null) {
      return { ret: path_ret, fd_obj: null };
    }
    let { ret, entry } = this.dir.get_entry_for_path(path);
    if (entry == null) {
      if (ret != ERRNO_NOENT) {
        return { ret, fd_obj: null };
      }
      if ((oflags & OFLAGS_CREAT) == OFLAGS_CREAT) {
        const { ret: ret2, entry: new_entry } = this.dir.create_entry_for_path(
          path_str,
          (oflags & OFLAGS_DIRECTORY) == OFLAGS_DIRECTORY
        );
        if (new_entry == null) {
          return { ret: ret2, fd_obj: null };
        }
        entry = new_entry;
      } else {
        return { ret: ERRNO_NOENT, fd_obj: null };
      }
    } else if ((oflags & OFLAGS_EXCL) == OFLAGS_EXCL) {
      return { ret: ERRNO_EXIST, fd_obj: null };
    }
    if ((oflags & OFLAGS_DIRECTORY) == OFLAGS_DIRECTORY && entry.stat().filetype !== FILETYPE_DIRECTORY) {
      return { ret: ERRNO_NOTDIR, fd_obj: null };
    }
    return entry.path_open(oflags, fs_rights_base, fd_flags);
  }
  path_create_directory(path) {
    return this.path_open(
      0,
      path,
      OFLAGS_CREAT | OFLAGS_DIRECTORY,
      0n,
      0n,
      0
    ).ret;
  }
  path_link(path_str, inode, allow_dir) {
    const { ret: path_ret, path } = Path.from(path_str);
    if (path == null) {
      return path_ret;
    }
    if (path.is_dir) {
      return ERRNO_NOENT;
    }
    const {
      ret: parent_ret,
      parent_entry,
      filename,
      entry
    } = this.dir.get_parent_dir_and_entry_for_path(path, true);
    if (parent_entry == null || filename == null) {
      return parent_ret;
    }
    if (entry != null) {
      const source_is_dir = inode.stat().filetype == FILETYPE_DIRECTORY;
      const target_is_dir = entry.stat().filetype == FILETYPE_DIRECTORY;
      if (source_is_dir && target_is_dir) {
        if (allow_dir && entry instanceof Directory) {
          if (entry.contents.size == 0) {
          } else {
            return ERRNO_NOTEMPTY;
          }
        } else {
          return ERRNO_EXIST;
        }
      } else if (source_is_dir && !target_is_dir) {
        return ERRNO_NOTDIR;
      } else if (!source_is_dir && target_is_dir) {
        return ERRNO_ISDIR;
      } else if (inode.stat().filetype == FILETYPE_REGULAR_FILE && entry.stat().filetype == FILETYPE_REGULAR_FILE) {
      } else {
        return ERRNO_EXIST;
      }
    }
    if (!allow_dir && inode.stat().filetype == FILETYPE_DIRECTORY) {
      return ERRNO_PERM;
    }
    parent_entry.contents.set(filename, inode);
    return ERRNO_SUCCESS;
  }
  path_unlink(path_str) {
    const { ret: path_ret, path } = Path.from(path_str);
    if (path == null) {
      return { ret: path_ret, inode_obj: null };
    }
    const {
      ret: parent_ret,
      parent_entry,
      filename,
      entry
    } = this.dir.get_parent_dir_and_entry_for_path(path, true);
    if (parent_entry == null || filename == null) {
      return { ret: parent_ret, inode_obj: null };
    }
    if (entry == null) {
      return { ret: ERRNO_NOENT, inode_obj: null };
    }
    parent_entry.contents.delete(filename);
    return { ret: ERRNO_SUCCESS, inode_obj: entry };
  }
  path_unlink_file(path_str) {
    const { ret: path_ret, path } = Path.from(path_str);
    if (path == null) {
      return path_ret;
    }
    const {
      ret: parent_ret,
      parent_entry,
      filename,
      entry
    } = this.dir.get_parent_dir_and_entry_for_path(path, false);
    if (parent_entry == null || filename == null || entry == null) {
      return parent_ret;
    }
    if (entry.stat().filetype === FILETYPE_DIRECTORY) {
      return ERRNO_ISDIR;
    }
    parent_entry.contents.delete(filename);
    return ERRNO_SUCCESS;
  }
  path_remove_directory(path_str) {
    const { ret: path_ret, path } = Path.from(path_str);
    if (path == null) {
      return path_ret;
    }
    const {
      ret: parent_ret,
      parent_entry,
      filename,
      entry
    } = this.dir.get_parent_dir_and_entry_for_path(path, false);
    if (parent_entry == null || filename == null || entry == null) {
      return parent_ret;
    }
    if (!(entry instanceof Directory) || entry.stat().filetype !== FILETYPE_DIRECTORY) {
      return ERRNO_NOTDIR;
    }
    if (entry.contents.size !== 0) {
      return ERRNO_NOTEMPTY;
    }
    if (!parent_entry.contents.delete(filename)) {
      return ERRNO_NOENT;
    }
    return ERRNO_SUCCESS;
  }
  fd_filestat_get() {
    return { ret: 0, filestat: this.dir.stat() };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fd_filestat_set_size(size) {
    return ERRNO_BADF;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fd_read(size) {
    return { ret: ERRNO_BADF, data: new Uint8Array() };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fd_pread(size, offset) {
    return { ret: ERRNO_BADF, data: new Uint8Array() };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fd_write(data) {
    return { ret: ERRNO_BADF, nwritten: 0 };
  }
  fd_pwrite(data, offset) {
    return { ret: ERRNO_BADF, nwritten: 0 };
  }
};
var PreopenDirectory = class extends OpenDirectory {
  prestat_name;
  constructor(name, contents) {
    super(new Directory(contents));
    this.prestat_name = name;
  }
  fd_prestat_get() {
    return {
      ret: 0,
      prestat: Prestat.dir(this.prestat_name)
    };
  }
};
var File = class extends Inode {
  data;
  readonly;
  constructor(data, options) {
    super();
    this.data = new Uint8Array(data);
    this.readonly = !!options?.readonly;
  }
  path_open(oflags, fs_rights_base, fd_flags) {
    if (this.readonly && (fs_rights_base & BigInt(RIGHTS_FD_WRITE)) == BigInt(RIGHTS_FD_WRITE)) {
      return { ret: ERRNO_PERM, fd_obj: null };
    }
    if ((oflags & OFLAGS_TRUNC) == OFLAGS_TRUNC) {
      if (this.readonly) return { ret: ERRNO_PERM, fd_obj: null };
      this.data = new Uint8Array([]);
    }
    const file = new OpenFile(this);
    if (fd_flags & FDFLAGS_APPEND) file.fd_seek(0n, WHENCE_END);
    return { ret: ERRNO_SUCCESS, fd_obj: file };
  }
  get size() {
    return BigInt(this.data.byteLength);
  }
  stat() {
    return new Filestat(FILETYPE_REGULAR_FILE, this.size);
  }
};
var Path = class _Path {
  parts = [];
  is_dir = false;
  static from(path) {
    const self2 = new _Path();
    self2.is_dir = path.endsWith("/");
    if (path.startsWith("/")) {
      return { ret: ERRNO_NOTCAPABLE, path: null };
    }
    if (path.includes("\0")) {
      return { ret: ERRNO_INVAL, path: null };
    }
    for (const component of path.split("/")) {
      if (component === "" || component === ".") {
        continue;
      }
      if (component === "..") {
        if (self2.parts.pop() == void 0) {
          return { ret: ERRNO_NOTCAPABLE, path: null };
        }
        continue;
      }
      self2.parts.push(component);
    }
    return { ret: ERRNO_SUCCESS, path: self2 };
  }
  to_path_string() {
    let s = this.parts.join("/");
    if (this.is_dir) {
      s += "/";
    }
    return s;
  }
};
var Directory = class _Directory extends Inode {
  contents;
  constructor(contents) {
    super();
    if (contents instanceof Array) {
      this.contents = new Map(contents);
    } else {
      this.contents = contents;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  path_open(oflags, fs_rights_base, fd_flags) {
    return { ret: ERRNO_SUCCESS, fd_obj: new OpenDirectory(this) };
  }
  stat() {
    return new Filestat(FILETYPE_DIRECTORY, 0n);
  }
  get_entry_for_path(path) {
    let entry = this;
    for (const component of path.parts) {
      if (!(entry instanceof _Directory)) {
        return { ret: ERRNO_NOTDIR, entry: null };
      }
      const child = entry.contents.get(component);
      if (child !== void 0) {
        entry = child;
      } else {
        debug.log(component);
        return { ret: ERRNO_NOENT, entry: null };
      }
    }
    if (path.is_dir) {
      if (entry.stat().filetype != FILETYPE_DIRECTORY) {
        return { ret: ERRNO_NOTDIR, entry: null };
      }
    }
    return { ret: ERRNO_SUCCESS, entry };
  }
  get_parent_dir_and_entry_for_path(path, allow_undefined) {
    const filename = path.parts.pop();
    if (filename === void 0) {
      return {
        ret: ERRNO_INVAL,
        parent_entry: null,
        filename: null,
        entry: null
      };
    }
    const { ret: entry_ret, entry: parent_entry } = this.get_entry_for_path(path);
    if (parent_entry == null) {
      return {
        ret: entry_ret,
        parent_entry: null,
        filename: null,
        entry: null
      };
    }
    if (!(parent_entry instanceof _Directory)) {
      return {
        ret: ERRNO_NOTDIR,
        parent_entry: null,
        filename: null,
        entry: null
      };
    }
    const entry = parent_entry.contents.get(filename);
    if (entry === void 0) {
      if (!allow_undefined) {
        return {
          ret: ERRNO_NOENT,
          parent_entry: null,
          filename: null,
          entry: null
        };
      } else {
        return { ret: ERRNO_SUCCESS, parent_entry, filename, entry: null };
      }
    }
    if (path.is_dir) {
      if (entry.stat().filetype != FILETYPE_DIRECTORY) {
        return {
          ret: ERRNO_NOTDIR,
          parent_entry: null,
          filename: null,
          entry: null
        };
      }
    }
    return { ret: ERRNO_SUCCESS, parent_entry, filename, entry };
  }
  create_entry_for_path(path_str, is_dir) {
    const { ret: path_ret, path } = Path.from(path_str);
    if (path == null) {
      return { ret: path_ret, entry: null };
    }
    let {
      // eslint-disable-next-line prefer-const
      ret: parent_ret,
      // eslint-disable-next-line prefer-const
      parent_entry,
      // eslint-disable-next-line prefer-const
      filename,
      entry
    } = this.get_parent_dir_and_entry_for_path(path, true);
    if (parent_entry == null || filename == null) {
      return { ret: parent_ret, entry: null };
    }
    if (entry != null) {
      return { ret: ERRNO_EXIST, entry: null };
    }
    debug.log("create", path);
    let new_child;
    if (!is_dir) {
      new_child = new File(new ArrayBuffer(0));
    } else {
      new_child = new _Directory(/* @__PURE__ */ new Map());
    }
    parent_entry.contents.set(filename, new_child);
    entry = new_child;
    return { ret: ERRNO_SUCCESS, entry };
  }
  get_file(file) {
    const f = this.contents.get(file);
    if (f instanceof File) {
      return f;
    } else {
      return null;
    }
  }
};

// rustbuild/wasi/strace.ts
function strace(imports, no_trace) {
  return new Proxy(imports, {
    get(target, prop, receiver) {
      const f = Reflect.get(target, prop, receiver);
      if (no_trace.includes(prop)) {
        return f;
      }
      return function(...args) {
        const result = Reflect.apply(f, receiver, args);
        return result;
      };
    }
  });
}

// rustbuild/rust-worker.ts
var BASE = "vendor/rust/wasm-rustc";
var RLIBS = [
  "libaddr2line-b8754aeb03c02354.rlib",
  "libadler-05c3545f6cd12159.rlib",
  "liballoc-0dab879bc41cd6bd.rlib",
  "libcfg_if-c7fd2cef50341546.rlib",
  "libcompiler_builtins-a99947d020d809d6.rlib",
  "libcore-4b8e8a815d049db3.rlib",
  "libgimli-598847d27d7a3cbf.rlib",
  "libhashbrown-d2ff91fdf93cacb2.rlib",
  "liblibc-dc63949c664c3fce.rlib",
  "libmemchr-2d3a423be1a6cb96.rlib",
  "libminiz_oxide-b109506a0ccc4c6a.rlib",
  "libobject-7b48def7544c748b.rlib",
  "libpanic_abort-c93441899b93b849.rlib",
  "libpanic_unwind-11d9ba05b60bf694.rlib",
  "librustc_demangle-59342a335246393d.rlib",
  "librustc_std_workspace_alloc-552b185085090ff6.rlib",
  "librustc_std_workspace_core-5d8a121daa7eeaa9.rlib",
  "librustc_std_workspace_std-97f43841ce452f7d.rlib",
  "libstd-bdedb7706a556da2.rlib",
  "libstd-bdedb7706a556da2.so",
  "libstd_detect-cca21eebc4281add.rlib",
  "libsysroot-f654e185be3ffebd.rlib",
  "libunwind-747b693f90af9445.rlib"
];
var Stdio = class extends Fd {
  out;
  constructor(out) {
    super();
    this.out = out;
  }
  fd_write(data) {
    this.out.push(data.slice());
    return { ret: 0, nwritten: data.byteLength };
  }
  clear() {
    this.out.length = 0;
  }
  text() {
    const d = new TextDecoder("utf-8");
    let s = "";
    for (const b of this.out) s += d.decode(b);
    return s;
  }
};
var cachePromise = null;
async function fetchFile(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`fetch ${path} -> ${r.status}`);
  return new File(new Uint8Array(await r.arrayBuffer()));
}
async function initOnce() {
  const [miriModule, libDir] = await Promise.all([
    WebAssembly.compileStreaming(fetch(`${BASE}/bin/miri.wasm`)),
    (async () => {
      const entries = await Promise.all(
        RLIBS.map(async (f) => [f, await fetchFile(`${BASE}/lib/rustlib/x86_64-unknown-linux-gnu/lib/${f}`)])
      );
      return new Directory(entries);
    })()
  ]);
  return { miriModule, libDir };
}
function truncatePanic(out) {
  const i = out.indexOf("panic_unwind/src/gcc.rs");
  if (i === -1) return out;
  const noteEnd = out.indexOf("\n", out.indexOf("RUST_BACKTRACE", 0));
  const lastPanic = out.lastIndexOf("panicked at", i);
  const cut = out.lastIndexOf("\n", lastPanic);
  return cut > 0 ? out.slice(0, cut) : out.slice(0, i);
}
async function runMiri(pre, fullSource) {
  const out = [];
  const stdin = new Stdio(out), stdout = new Stdio(out), stderr = new Stdio(out);
  const tmp = new PreopenDirectory("/tmp", []);
  const root = new PreopenDirectory("/", [["main.rs", new File(new TextEncoder().encode(fullSource))]]);
  const sysroot = new PreopenDirectory("/sysroot", [
    ["lib", new Directory([["rustlib", new Directory([
      ["wasm32-wasi", new Directory([["lib", new Directory([])]])],
      ["x86_64-unknown-linux-gnu", new Directory([["lib", pre.libDir]])]
    ])]])]
  ]);
  const fds = [stdin, stdout, stderr, tmp, sysroot, root];
  const args = [
    "miri",
    "--sysroot",
    "/sysroot",
    "main.rs",
    "--target",
    "x86_64-unknown-linux-gnu",
    "-Zmir-opt-level=3",
    "-Zmiri-ignore-leaks",
    "-Zmiri-permissive-provenance",
    "-Zmiri-preemption-rate=0",
    "-Zmiri-disable-alignment-check",
    "-Zmiri-disable-data-race-detector",
    "-Zmiri-disable-stacked-borrows",
    "-Zmiri-disable-validation",
    "-Zmir-emit-retag=false",
    "-Zmiri-disable-isolation",
    "-Zmiri-panic-on-unsupported",
    "--color=never"
  ];
  const wasi = new WASI(args, [], fds, { debug: false });
  let next_thread_id = 1;
  const inst = await WebAssembly.instantiate(pre.miriModule, {
    env: { memory: new WebAssembly.Memory({ initial: 256, maximum: 1024 * 4, shared: false }) },
    wasi: { "thread-spawn": function(start_arg) {
      const id = next_thread_id++;
      inst.exports.wasi_thread_start(id, start_arg);
      return id;
    } },
    wasi_snapshot_preview1: strace(wasi.wasiImport, ["fd_prestat_get"])
  });
  try {
    wasi.start(inst);
  } catch (_) {
  }
  return stdout.text();
}
function synth(source, cases, support) {
  const json = support && support["json.rs"] || "";
  const casesJson = JSON.stringify(cases);
  const preamble = `#![allow(dead_code, unused)]
use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicIsize, Ordering};
static LIVE: AtomicIsize = AtomicIsize::new(0);
static PEAK: AtomicIsize = AtomicIsize::new(0);
struct GxAlloc;
unsafe impl GlobalAlloc for GxAlloc {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        let n = LIVE.fetch_add(l.size() as isize, Ordering::Relaxed) + l.size() as isize;
        let mut p = PEAK.load(Ordering::Relaxed);
        while n > p { match PEAK.compare_exchange_weak(p, n, Ordering::Relaxed, Ordering::Relaxed) { Ok(_) => break, Err(x) => p = x } }
        System.alloc(l)
    }
    unsafe fn dealloc(&self, ptr: *mut u8, l: Layout) { LIVE.fetch_sub(l.size() as isize, Ordering::Relaxed); System.dealloc(ptr, l) }
    unsafe fn realloc(&self, ptr: *mut u8, l: Layout, ns: usize) -> *mut u8 {
        let d = ns as isize - l.size() as isize;
        let n = LIVE.fetch_add(d, Ordering::Relaxed) + d;
        let mut p = PEAK.load(Ordering::Relaxed);
        while n > p { match PEAK.compare_exchange_weak(p, n, Ordering::Relaxed, Ordering::Relaxed) { Ok(_) => break, Err(x) => p = x } }
        System.realloc(ptr, l, ns)
    }
}
#[global_allocator] static GX: GxAlloc = GxAlloc;
mod json {
${json}
}
`;
  const tail = `const CASES_JSON: &str = r####"${casesJson}"####;
fn main() {
    let cv = json::parse(CASES_JSON);
    let cases = cv.as_arr();
    let mut passed = 0;
    for (i, c) in cases.iter().enumerate() {
        let input = c.get("input");
        // Miri is a slow interpreter (~1000x); keep it to 3 solves/case. Its
        // virtual clock is ~proportional to work but noisy on the first call
        // (lazy init), so warm up once (discard), then best-of-2 timed for a
        // stable growth signal. Heap = allocator high-water above baseline during
        // the timed solve (peak workspace; excludes stack, which Miri can't expose).
        use std::time::Instant;
        std::hint::black_box(solve(std::hint::black_box(input)));
        let base = LIVE.load(Ordering::Relaxed);
        PEAK.store(base, Ordering::Relaxed);
        let t0 = Instant::now();
        let result = std::hint::black_box(solve(std::hint::black_box(input)));
        let mut ns = t0.elapsed().as_nanos() as u64;
        let heap = (PEAK.load(Ordering::Relaxed) - base).max(0);
        let t1 = Instant::now();
        std::hint::black_box(solve(std::hint::black_box(input)));
        let ns2 = t1.elapsed().as_nanos() as u64;
        if ns2 < ns { ns = ns2; }
        let got = result.dump();
        let exp = c.get("expected").dump();
        if got == exp { passed += 1; println!("  [PASS] case {}", i); }
        else { println!("  [FAIL] case {}  expected={} got={}", i, exp, got); }
        println!("[METRIC] case {} ns={}", i, ns);
        println!("[SPACE] case {} heap={}", i, heap);
    }
    println!("{}/{} passed", passed, cases.len());
}
`;
  const program = preamble + source + "\n" + tail;
  const userStart = preamble.split("\n").length;
  const userEnd = userStart + source.split("\n").length - 1;
  return { program, userStart, userEnd };
}
function remapLines(out, userStart, userEnd) {
  return out.replace(/main\.rs:(\d+)(:\d+)?/g, (m, L, C) => {
    const n = Number(L);
    if (n >= userStart && n <= userEnd) return `main.rs:${n - userStart + 1}${C || ""}`;
    return `<glifex harness>${C || ""}`;
  });
}
function parse(out, cases) {
  const byI = /* @__PURE__ */ new Map();
  const nsById = /* @__PURE__ */ new Map();
  const heapById = /* @__PURE__ */ new Map();
  for (const line of out.split("\n")) {
    const m = line.match(/\[(PASS|FAIL)\]\s+case\s+(\d+)(?:\s+expected=(.*?)\s+got=(.*))?/);
    if (m) byI.set(Number(m[2]), { ok: m[1] === "PASS", exp: m[3], got: m[4] });
    const mm = line.match(/\[METRIC\]\s+case\s+(\d+)\s+ns=(\d+)/);
    if (mm) nsById.set(Number(mm[1]), Number(mm[2]));
    const ms = line.match(/\[SPACE\]\s+case\s+(\d+)\s+heap=(\d+)/);
    if (ms) heapById.set(Number(ms[1]), Number(ms[2]));
  }
  if (byI.size === 0) return { error: "no case results from Rust harness:\n" + out.trim().slice(0, 600) };
  const results = cases.map((c, i) => {
    const r = byI.get(i);
    const tNs = nsById.has(i) && nsById.get(i) > 0 ? nsById.get(i) : null;
    const row = r ? r.ok ? { i, ok: true, got: c.expected, expected: c.expected, tNs } : { i, ok: false, got: r.got != null ? r.got : "(see output)", expected: r.exp != null ? r.exp : c.expected, tNs } : { i, ok: false, error: "no result for case", expected: c.expected };
    if (heapById.has(i)) row.space = heapById.get(i);
    return row;
  });
  return { results };
}
self.addEventListener("message", async (e) => {
  const d = e.data || {};
  if (d.id !== "run") return;
  try {
    if (!cachePromise) cachePromise = initOnce();
    const pre = await cachePromise;
    const { program, userStart, userEnd } = synth(d.source, d.cases || [], d.support || {});
    let out = await runMiri(pre, program);
    out = truncatePanic(remapLines(out, userStart, userEnd));
    const parsed = parse(out, d.cases || []);
    if (parsed.error) return void self.postMessage({ id: "error", error: parsed.error });
    self.postMessage({ id: "result", results: parsed.results, nsPerCase: 0, spaceApprox: true, spaceApproxKind: "peak" });
  } catch (err) {
    self.postMessage({ id: "error", error: String(err && err.message || err) });
  }
});
