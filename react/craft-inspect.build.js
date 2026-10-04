var CS2CraftInspect = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/base64-js/index.js
  var require_base64_js = __commonJS({
    "node_modules/base64-js/index.js"(exports) {
      "use strict";
      init_craft_inspect_buffer_shim();
      exports.byteLength = byteLength;
      exports.toByteArray = toByteArray;
      exports.fromByteArray = fromByteArray;
      var lookup = [];
      var revLookup = [];
      var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
      var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      for (i = 0, len = code.length; i < len; ++i) {
        lookup[i] = code[i];
        revLookup[code.charCodeAt(i)] = i;
      }
      var i;
      var len;
      revLookup["-".charCodeAt(0)] = 62;
      revLookup["_".charCodeAt(0)] = 63;
      function getLens(b64) {
        var len2 = b64.length;
        if (len2 % 4 > 0) {
          throw new Error("Invalid string. Length must be a multiple of 4");
        }
        var validLen = b64.indexOf("=");
        if (validLen === -1) validLen = len2;
        var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
        return [validLen, placeHoldersLen];
      }
      function byteLength(b64) {
        var lens = getLens(b64);
        var validLen = lens[0];
        var placeHoldersLen = lens[1];
        return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
      }
      function _byteLength(b64, validLen, placeHoldersLen) {
        return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
      }
      function toByteArray(b64) {
        var tmp;
        var lens = getLens(b64);
        var validLen = lens[0];
        var placeHoldersLen = lens[1];
        var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
        var curByte = 0;
        var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
        var i2;
        for (i2 = 0; i2 < len2; i2 += 4) {
          tmp = revLookup[b64.charCodeAt(i2)] << 18 | revLookup[b64.charCodeAt(i2 + 1)] << 12 | revLookup[b64.charCodeAt(i2 + 2)] << 6 | revLookup[b64.charCodeAt(i2 + 3)];
          arr[curByte++] = tmp >> 16 & 255;
          arr[curByte++] = tmp >> 8 & 255;
          arr[curByte++] = tmp & 255;
        }
        if (placeHoldersLen === 2) {
          tmp = revLookup[b64.charCodeAt(i2)] << 2 | revLookup[b64.charCodeAt(i2 + 1)] >> 4;
          arr[curByte++] = tmp & 255;
        }
        if (placeHoldersLen === 1) {
          tmp = revLookup[b64.charCodeAt(i2)] << 10 | revLookup[b64.charCodeAt(i2 + 1)] << 4 | revLookup[b64.charCodeAt(i2 + 2)] >> 2;
          arr[curByte++] = tmp >> 8 & 255;
          arr[curByte++] = tmp & 255;
        }
        return arr;
      }
      function tripletToBase64(num) {
        return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
      }
      function encodeChunk(uint8, start, end) {
        var tmp;
        var output = [];
        for (var i2 = start; i2 < end; i2 += 3) {
          tmp = (uint8[i2] << 16 & 16711680) + (uint8[i2 + 1] << 8 & 65280) + (uint8[i2 + 2] & 255);
          output.push(tripletToBase64(tmp));
        }
        return output.join("");
      }
      function fromByteArray(uint8) {
        var tmp;
        var len2 = uint8.length;
        var extraBytes = len2 % 3;
        var parts = [];
        var maxChunkLength = 16383;
        for (var i2 = 0, len22 = len2 - extraBytes; i2 < len22; i2 += maxChunkLength) {
          parts.push(encodeChunk(uint8, i2, i2 + maxChunkLength > len22 ? len22 : i2 + maxChunkLength));
        }
        if (extraBytes === 1) {
          tmp = uint8[len2 - 1];
          parts.push(
            lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "=="
          );
        } else if (extraBytes === 2) {
          tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
          parts.push(
            lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
          );
        }
        return parts.join("");
      }
    }
  });

  // node_modules/ieee754/index.js
  var require_ieee754 = __commonJS({
    "node_modules/ieee754/index.js"(exports) {
      init_craft_inspect_buffer_shim();
      exports.read = function(buffer, offset, isLE, mLen, nBytes) {
        var e, m;
        var eLen = nBytes * 8 - mLen - 1;
        var eMax = (1 << eLen) - 1;
        var eBias = eMax >> 1;
        var nBits = -7;
        var i = isLE ? nBytes - 1 : 0;
        var d = isLE ? -1 : 1;
        var s = buffer[offset + i];
        i += d;
        e = s & (1 << -nBits) - 1;
        s >>= -nBits;
        nBits += eLen;
        for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {
        }
        m = e & (1 << -nBits) - 1;
        e >>= -nBits;
        nBits += mLen;
        for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {
        }
        if (e === 0) {
          e = 1 - eBias;
        } else if (e === eMax) {
          return m ? NaN : (s ? -1 : 1) * Infinity;
        } else {
          m = m + Math.pow(2, mLen);
          e = e - eBias;
        }
        return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
      };
      exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
        var e, m, c;
        var eLen = nBytes * 8 - mLen - 1;
        var eMax = (1 << eLen) - 1;
        var eBias = eMax >> 1;
        var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
        var i = isLE ? 0 : nBytes - 1;
        var d = isLE ? 1 : -1;
        var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
        value = Math.abs(value);
        if (isNaN(value) || value === Infinity) {
          m = isNaN(value) ? 1 : 0;
          e = eMax;
        } else {
          e = Math.floor(Math.log(value) / Math.LN2);
          if (value * (c = Math.pow(2, -e)) < 1) {
            e--;
            c *= 2;
          }
          if (e + eBias >= 1) {
            value += rt / c;
          } else {
            value += rt * Math.pow(2, 1 - eBias);
          }
          if (value * c >= 2) {
            e++;
            c /= 2;
          }
          if (e + eBias >= eMax) {
            m = 0;
            e = eMax;
          } else if (e + eBias >= 1) {
            m = (value * c - 1) * Math.pow(2, mLen);
            e = e + eBias;
          } else {
            m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
            e = 0;
          }
        }
        for (; mLen >= 8; buffer[offset + i] = m & 255, i += d, m /= 256, mLen -= 8) {
        }
        e = e << mLen | m;
        eLen += mLen;
        for (; eLen > 0; buffer[offset + i] = e & 255, i += d, e /= 256, eLen -= 8) {
        }
        buffer[offset + i - d] |= s * 128;
      };
    }
  });

  // node_modules/buffer/index.js
  var require_buffer = __commonJS({
    "node_modules/buffer/index.js"(exports) {
      "use strict";
      init_craft_inspect_buffer_shim();
      var base64 = require_base64_js();
      var ieee754 = require_ieee754();
      var customInspectSymbol = typeof Symbol === "function" && typeof Symbol["for"] === "function" ? Symbol["for"]("nodejs.util.inspect.custom") : null;
      exports.Buffer = Buffer3;
      exports.SlowBuffer = SlowBuffer;
      exports.INSPECT_MAX_BYTES = 50;
      var K_MAX_LENGTH = 2147483647;
      exports.kMaxLength = K_MAX_LENGTH;
      Buffer3.TYPED_ARRAY_SUPPORT = typedArraySupport();
      if (!Buffer3.TYPED_ARRAY_SUPPORT && typeof console !== "undefined" && typeof console.error === "function") {
        console.error(
          "This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support."
        );
      }
      function typedArraySupport() {
        try {
          const arr = new Uint8Array(1);
          const proto = { foo: function() {
            return 42;
          } };
          Object.setPrototypeOf(proto, Uint8Array.prototype);
          Object.setPrototypeOf(arr, proto);
          return arr.foo() === 42;
        } catch (e) {
          return false;
        }
      }
      Object.defineProperty(Buffer3.prototype, "parent", {
        enumerable: true,
        get: function() {
          if (!Buffer3.isBuffer(this)) return void 0;
          return this.buffer;
        }
      });
      Object.defineProperty(Buffer3.prototype, "offset", {
        enumerable: true,
        get: function() {
          if (!Buffer3.isBuffer(this)) return void 0;
          return this.byteOffset;
        }
      });
      function createBuffer(length) {
        if (length > K_MAX_LENGTH) {
          throw new RangeError('The value "' + length + '" is invalid for option "size"');
        }
        const buf = new Uint8Array(length);
        Object.setPrototypeOf(buf, Buffer3.prototype);
        return buf;
      }
      function Buffer3(arg, encodingOrOffset, length) {
        if (typeof arg === "number") {
          if (typeof encodingOrOffset === "string") {
            throw new TypeError(
              'The "string" argument must be of type string. Received type number'
            );
          }
          return allocUnsafe(arg);
        }
        return from(arg, encodingOrOffset, length);
      }
      Buffer3.poolSize = 8192;
      function from(value, encodingOrOffset, length) {
        if (typeof value === "string") {
          return fromString(value, encodingOrOffset);
        }
        if (ArrayBuffer.isView(value)) {
          return fromArrayView(value);
        }
        if (value == null) {
          throw new TypeError(
            "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
          );
        }
        if (isInstance(value, ArrayBuffer) || value && isInstance(value.buffer, ArrayBuffer)) {
          return fromArrayBuffer(value, encodingOrOffset, length);
        }
        if (typeof SharedArrayBuffer !== "undefined" && (isInstance(value, SharedArrayBuffer) || value && isInstance(value.buffer, SharedArrayBuffer))) {
          return fromArrayBuffer(value, encodingOrOffset, length);
        }
        if (typeof value === "number") {
          throw new TypeError(
            'The "value" argument must not be of type number. Received type number'
          );
        }
        const valueOf = value.valueOf && value.valueOf();
        if (valueOf != null && valueOf !== value) {
          return Buffer3.from(valueOf, encodingOrOffset, length);
        }
        const b = fromObject(value);
        if (b) return b;
        if (typeof Symbol !== "undefined" && Symbol.toPrimitive != null && typeof value[Symbol.toPrimitive] === "function") {
          return Buffer3.from(value[Symbol.toPrimitive]("string"), encodingOrOffset, length);
        }
        throw new TypeError(
          "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
        );
      }
      Buffer3.from = function(value, encodingOrOffset, length) {
        return from(value, encodingOrOffset, length);
      };
      Object.setPrototypeOf(Buffer3.prototype, Uint8Array.prototype);
      Object.setPrototypeOf(Buffer3, Uint8Array);
      function assertSize(size) {
        if (typeof size !== "number") {
          throw new TypeError('"size" argument must be of type number');
        } else if (size < 0) {
          throw new RangeError('The value "' + size + '" is invalid for option "size"');
        }
      }
      function alloc(size, fill, encoding) {
        assertSize(size);
        if (size <= 0) {
          return createBuffer(size);
        }
        if (fill !== void 0) {
          return typeof encoding === "string" ? createBuffer(size).fill(fill, encoding) : createBuffer(size).fill(fill);
        }
        return createBuffer(size);
      }
      Buffer3.alloc = function(size, fill, encoding) {
        return alloc(size, fill, encoding);
      };
      function allocUnsafe(size) {
        assertSize(size);
        return createBuffer(size < 0 ? 0 : checked(size) | 0);
      }
      Buffer3.allocUnsafe = function(size) {
        return allocUnsafe(size);
      };
      Buffer3.allocUnsafeSlow = function(size) {
        return allocUnsafe(size);
      };
      function fromString(string, encoding) {
        if (typeof encoding !== "string" || encoding === "") {
          encoding = "utf8";
        }
        if (!Buffer3.isEncoding(encoding)) {
          throw new TypeError("Unknown encoding: " + encoding);
        }
        const length = byteLength(string, encoding) | 0;
        let buf = createBuffer(length);
        const actual = buf.write(string, encoding);
        if (actual !== length) {
          buf = buf.slice(0, actual);
        }
        return buf;
      }
      function fromArrayLike(array) {
        const length = array.length < 0 ? 0 : checked(array.length) | 0;
        const buf = createBuffer(length);
        for (let i = 0; i < length; i += 1) {
          buf[i] = array[i] & 255;
        }
        return buf;
      }
      function fromArrayView(arrayView) {
        if (isInstance(arrayView, Uint8Array)) {
          const copy = new Uint8Array(arrayView);
          return fromArrayBuffer(copy.buffer, copy.byteOffset, copy.byteLength);
        }
        return fromArrayLike(arrayView);
      }
      function fromArrayBuffer(array, byteOffset, length) {
        if (byteOffset < 0 || array.byteLength < byteOffset) {
          throw new RangeError('"offset" is outside of buffer bounds');
        }
        if (array.byteLength < byteOffset + (length || 0)) {
          throw new RangeError('"length" is outside of buffer bounds');
        }
        let buf;
        if (byteOffset === void 0 && length === void 0) {
          buf = new Uint8Array(array);
        } else if (length === void 0) {
          buf = new Uint8Array(array, byteOffset);
        } else {
          buf = new Uint8Array(array, byteOffset, length);
        }
        Object.setPrototypeOf(buf, Buffer3.prototype);
        return buf;
      }
      function fromObject(obj) {
        if (Buffer3.isBuffer(obj)) {
          const len = checked(obj.length) | 0;
          const buf = createBuffer(len);
          if (buf.length === 0) {
            return buf;
          }
          obj.copy(buf, 0, 0, len);
          return buf;
        }
        if (obj.length !== void 0) {
          if (typeof obj.length !== "number" || numberIsNaN(obj.length)) {
            return createBuffer(0);
          }
          return fromArrayLike(obj);
        }
        if (obj.type === "Buffer" && Array.isArray(obj.data)) {
          return fromArrayLike(obj.data);
        }
      }
      function checked(length) {
        if (length >= K_MAX_LENGTH) {
          throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + K_MAX_LENGTH.toString(16) + " bytes");
        }
        return length | 0;
      }
      function SlowBuffer(length) {
        if (+length != length) {
          length = 0;
        }
        return Buffer3.alloc(+length);
      }
      Buffer3.isBuffer = function isBuffer(b) {
        return b != null && b._isBuffer === true && b !== Buffer3.prototype;
      };
      Buffer3.compare = function compare(a, b) {
        if (isInstance(a, Uint8Array)) a = Buffer3.from(a, a.offset, a.byteLength);
        if (isInstance(b, Uint8Array)) b = Buffer3.from(b, b.offset, b.byteLength);
        if (!Buffer3.isBuffer(a) || !Buffer3.isBuffer(b)) {
          throw new TypeError(
            'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
          );
        }
        if (a === b) return 0;
        let x = a.length;
        let y = b.length;
        for (let i = 0, len = Math.min(x, y); i < len; ++i) {
          if (a[i] !== b[i]) {
            x = a[i];
            y = b[i];
            break;
          }
        }
        if (x < y) return -1;
        if (y < x) return 1;
        return 0;
      };
      Buffer3.isEncoding = function isEncoding(encoding) {
        switch (String(encoding).toLowerCase()) {
          case "hex":
          case "utf8":
          case "utf-8":
          case "ascii":
          case "latin1":
          case "binary":
          case "base64":
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return true;
          default:
            return false;
        }
      };
      Buffer3.concat = function concat(list, length) {
        if (!Array.isArray(list)) {
          throw new TypeError('"list" argument must be an Array of Buffers');
        }
        if (list.length === 0) {
          return Buffer3.alloc(0);
        }
        let i;
        if (length === void 0) {
          length = 0;
          for (i = 0; i < list.length; ++i) {
            length += list[i].length;
          }
        }
        const buffer = Buffer3.allocUnsafe(length);
        let pos = 0;
        for (i = 0; i < list.length; ++i) {
          let buf = list[i];
          if (isInstance(buf, Uint8Array)) {
            if (pos + buf.length > buffer.length) {
              if (!Buffer3.isBuffer(buf)) buf = Buffer3.from(buf);
              buf.copy(buffer, pos);
            } else {
              Uint8Array.prototype.set.call(
                buffer,
                buf,
                pos
              );
            }
          } else if (!Buffer3.isBuffer(buf)) {
            throw new TypeError('"list" argument must be an Array of Buffers');
          } else {
            buf.copy(buffer, pos);
          }
          pos += buf.length;
        }
        return buffer;
      };
      function byteLength(string, encoding) {
        if (Buffer3.isBuffer(string)) {
          return string.length;
        }
        if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
          return string.byteLength;
        }
        if (typeof string !== "string") {
          throw new TypeError(
            'The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type ' + typeof string
          );
        }
        const len = string.length;
        const mustMatch = arguments.length > 2 && arguments[2] === true;
        if (!mustMatch && len === 0) return 0;
        let loweredCase = false;
        for (; ; ) {
          switch (encoding) {
            case "ascii":
            case "latin1":
            case "binary":
              return len;
            case "utf8":
            case "utf-8":
              return utf8ToBytes(string).length;
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return len * 2;
            case "hex":
              return len >>> 1;
            case "base64":
              return base64ToBytes(string).length;
            default:
              if (loweredCase) {
                return mustMatch ? -1 : utf8ToBytes(string).length;
              }
              encoding = ("" + encoding).toLowerCase();
              loweredCase = true;
          }
        }
      }
      Buffer3.byteLength = byteLength;
      function slowToString(encoding, start, end) {
        let loweredCase = false;
        if (start === void 0 || start < 0) {
          start = 0;
        }
        if (start > this.length) {
          return "";
        }
        if (end === void 0 || end > this.length) {
          end = this.length;
        }
        if (end <= 0) {
          return "";
        }
        end >>>= 0;
        start >>>= 0;
        if (end <= start) {
          return "";
        }
        if (!encoding) encoding = "utf8";
        while (true) {
          switch (encoding) {
            case "hex":
              return hexSlice(this, start, end);
            case "utf8":
            case "utf-8":
              return utf8Slice(this, start, end);
            case "ascii":
              return asciiSlice(this, start, end);
            case "latin1":
            case "binary":
              return latin1Slice(this, start, end);
            case "base64":
              return base64Slice(this, start, end);
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return utf16leSlice(this, start, end);
            default:
              if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
              encoding = (encoding + "").toLowerCase();
              loweredCase = true;
          }
        }
      }
      Buffer3.prototype._isBuffer = true;
      function swap(b, n, m) {
        const i = b[n];
        b[n] = b[m];
        b[m] = i;
      }
      Buffer3.prototype.swap16 = function swap16() {
        const len = this.length;
        if (len % 2 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 16-bits");
        }
        for (let i = 0; i < len; i += 2) {
          swap(this, i, i + 1);
        }
        return this;
      };
      Buffer3.prototype.swap32 = function swap32() {
        const len = this.length;
        if (len % 4 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 32-bits");
        }
        for (let i = 0; i < len; i += 4) {
          swap(this, i, i + 3);
          swap(this, i + 1, i + 2);
        }
        return this;
      };
      Buffer3.prototype.swap64 = function swap64() {
        const len = this.length;
        if (len % 8 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 64-bits");
        }
        for (let i = 0; i < len; i += 8) {
          swap(this, i, i + 7);
          swap(this, i + 1, i + 6);
          swap(this, i + 2, i + 5);
          swap(this, i + 3, i + 4);
        }
        return this;
      };
      Buffer3.prototype.toString = function toString() {
        const length = this.length;
        if (length === 0) return "";
        if (arguments.length === 0) return utf8Slice(this, 0, length);
        return slowToString.apply(this, arguments);
      };
      Buffer3.prototype.toLocaleString = Buffer3.prototype.toString;
      Buffer3.prototype.equals = function equals(b) {
        if (!Buffer3.isBuffer(b)) throw new TypeError("Argument must be a Buffer");
        if (this === b) return true;
        return Buffer3.compare(this, b) === 0;
      };
      Buffer3.prototype.inspect = function inspect() {
        let str = "";
        const max = exports.INSPECT_MAX_BYTES;
        str = this.toString("hex", 0, max).replace(/(.{2})/g, "$1 ").trim();
        if (this.length > max) str += " ... ";
        return "<Buffer " + str + ">";
      };
      if (customInspectSymbol) {
        Buffer3.prototype[customInspectSymbol] = Buffer3.prototype.inspect;
      }
      Buffer3.prototype.compare = function compare(target, start, end, thisStart, thisEnd) {
        if (isInstance(target, Uint8Array)) {
          target = Buffer3.from(target, target.offset, target.byteLength);
        }
        if (!Buffer3.isBuffer(target)) {
          throw new TypeError(
            'The "target" argument must be one of type Buffer or Uint8Array. Received type ' + typeof target
          );
        }
        if (start === void 0) {
          start = 0;
        }
        if (end === void 0) {
          end = target ? target.length : 0;
        }
        if (thisStart === void 0) {
          thisStart = 0;
        }
        if (thisEnd === void 0) {
          thisEnd = this.length;
        }
        if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
          throw new RangeError("out of range index");
        }
        if (thisStart >= thisEnd && start >= end) {
          return 0;
        }
        if (thisStart >= thisEnd) {
          return -1;
        }
        if (start >= end) {
          return 1;
        }
        start >>>= 0;
        end >>>= 0;
        thisStart >>>= 0;
        thisEnd >>>= 0;
        if (this === target) return 0;
        let x = thisEnd - thisStart;
        let y = end - start;
        const len = Math.min(x, y);
        const thisCopy = this.slice(thisStart, thisEnd);
        const targetCopy = target.slice(start, end);
        for (let i = 0; i < len; ++i) {
          if (thisCopy[i] !== targetCopy[i]) {
            x = thisCopy[i];
            y = targetCopy[i];
            break;
          }
        }
        if (x < y) return -1;
        if (y < x) return 1;
        return 0;
      };
      function bidirectionalIndexOf(buffer, val, byteOffset, encoding, dir) {
        if (buffer.length === 0) return -1;
        if (typeof byteOffset === "string") {
          encoding = byteOffset;
          byteOffset = 0;
        } else if (byteOffset > 2147483647) {
          byteOffset = 2147483647;
        } else if (byteOffset < -2147483648) {
          byteOffset = -2147483648;
        }
        byteOffset = +byteOffset;
        if (numberIsNaN(byteOffset)) {
          byteOffset = dir ? 0 : buffer.length - 1;
        }
        if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
        if (byteOffset >= buffer.length) {
          if (dir) return -1;
          else byteOffset = buffer.length - 1;
        } else if (byteOffset < 0) {
          if (dir) byteOffset = 0;
          else return -1;
        }
        if (typeof val === "string") {
          val = Buffer3.from(val, encoding);
        }
        if (Buffer3.isBuffer(val)) {
          if (val.length === 0) {
            return -1;
          }
          return arrayIndexOf(buffer, val, byteOffset, encoding, dir);
        } else if (typeof val === "number") {
          val = val & 255;
          if (typeof Uint8Array.prototype.indexOf === "function") {
            if (dir) {
              return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset);
            } else {
              return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset);
            }
          }
          return arrayIndexOf(buffer, [val], byteOffset, encoding, dir);
        }
        throw new TypeError("val must be string, number or Buffer");
      }
      function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
        let indexSize = 1;
        let arrLength = arr.length;
        let valLength = val.length;
        if (encoding !== void 0) {
          encoding = String(encoding).toLowerCase();
          if (encoding === "ucs2" || encoding === "ucs-2" || encoding === "utf16le" || encoding === "utf-16le") {
            if (arr.length < 2 || val.length < 2) {
              return -1;
            }
            indexSize = 2;
            arrLength /= 2;
            valLength /= 2;
            byteOffset /= 2;
          }
        }
        function read(buf, i2) {
          if (indexSize === 1) {
            return buf[i2];
          } else {
            return buf.readUInt16BE(i2 * indexSize);
          }
        }
        let i;
        if (dir) {
          let foundIndex = -1;
          for (i = byteOffset; i < arrLength; i++) {
            if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
              if (foundIndex === -1) foundIndex = i;
              if (i - foundIndex + 1 === valLength) return foundIndex * indexSize;
            } else {
              if (foundIndex !== -1) i -= i - foundIndex;
              foundIndex = -1;
            }
          }
        } else {
          if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
          for (i = byteOffset; i >= 0; i--) {
            let found = true;
            for (let j = 0; j < valLength; j++) {
              if (read(arr, i + j) !== read(val, j)) {
                found = false;
                break;
              }
            }
            if (found) return i;
          }
        }
        return -1;
      }
      Buffer3.prototype.includes = function includes(val, byteOffset, encoding) {
        return this.indexOf(val, byteOffset, encoding) !== -1;
      };
      Buffer3.prototype.indexOf = function indexOf(val, byteOffset, encoding) {
        return bidirectionalIndexOf(this, val, byteOffset, encoding, true);
      };
      Buffer3.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
        return bidirectionalIndexOf(this, val, byteOffset, encoding, false);
      };
      function hexWrite(buf, string, offset, length) {
        offset = Number(offset) || 0;
        const remaining = buf.length - offset;
        if (!length) {
          length = remaining;
        } else {
          length = Number(length);
          if (length > remaining) {
            length = remaining;
          }
        }
        const strLen = string.length;
        if (length > strLen / 2) {
          length = strLen / 2;
        }
        let i;
        for (i = 0; i < length; ++i) {
          const parsed = parseInt(string.substr(i * 2, 2), 16);
          if (numberIsNaN(parsed)) return i;
          buf[offset + i] = parsed;
        }
        return i;
      }
      function utf8Write(buf, string, offset, length) {
        return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length);
      }
      function asciiWrite(buf, string, offset, length) {
        return blitBuffer(asciiToBytes(string), buf, offset, length);
      }
      function base64Write(buf, string, offset, length) {
        return blitBuffer(base64ToBytes(string), buf, offset, length);
      }
      function ucs2Write(buf, string, offset, length) {
        return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length);
      }
      Buffer3.prototype.write = function write(string, offset, length, encoding) {
        if (offset === void 0) {
          encoding = "utf8";
          length = this.length;
          offset = 0;
        } else if (length === void 0 && typeof offset === "string") {
          encoding = offset;
          length = this.length;
          offset = 0;
        } else if (isFinite(offset)) {
          offset = offset >>> 0;
          if (isFinite(length)) {
            length = length >>> 0;
            if (encoding === void 0) encoding = "utf8";
          } else {
            encoding = length;
            length = void 0;
          }
        } else {
          throw new Error(
            "Buffer.write(string, encoding, offset[, length]) is no longer supported"
          );
        }
        const remaining = this.length - offset;
        if (length === void 0 || length > remaining) length = remaining;
        if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
          throw new RangeError("Attempt to write outside buffer bounds");
        }
        if (!encoding) encoding = "utf8";
        let loweredCase = false;
        for (; ; ) {
          switch (encoding) {
            case "hex":
              return hexWrite(this, string, offset, length);
            case "utf8":
            case "utf-8":
              return utf8Write(this, string, offset, length);
            case "ascii":
            case "latin1":
            case "binary":
              return asciiWrite(this, string, offset, length);
            case "base64":
              return base64Write(this, string, offset, length);
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return ucs2Write(this, string, offset, length);
            default:
              if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
              encoding = ("" + encoding).toLowerCase();
              loweredCase = true;
          }
        }
      };
      Buffer3.prototype.toJSON = function toJSON() {
        return {
          type: "Buffer",
          data: Array.prototype.slice.call(this._arr || this, 0)
        };
      };
      function base64Slice(buf, start, end) {
        if (start === 0 && end === buf.length) {
          return base64.fromByteArray(buf);
        } else {
          return base64.fromByteArray(buf.slice(start, end));
        }
      }
      function utf8Slice(buf, start, end) {
        end = Math.min(buf.length, end);
        const res = [];
        let i = start;
        while (i < end) {
          const firstByte = buf[i];
          let codePoint = null;
          let bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
          if (i + bytesPerSequence <= end) {
            let secondByte, thirdByte, fourthByte, tempCodePoint;
            switch (bytesPerSequence) {
              case 1:
                if (firstByte < 128) {
                  codePoint = firstByte;
                }
                break;
              case 2:
                secondByte = buf[i + 1];
                if ((secondByte & 192) === 128) {
                  tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
                  if (tempCodePoint > 127) {
                    codePoint = tempCodePoint;
                  }
                }
                break;
              case 3:
                secondByte = buf[i + 1];
                thirdByte = buf[i + 2];
                if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
                  tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
                  if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) {
                    codePoint = tempCodePoint;
                  }
                }
                break;
              case 4:
                secondByte = buf[i + 1];
                thirdByte = buf[i + 2];
                fourthByte = buf[i + 3];
                if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
                  tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
                  if (tempCodePoint > 65535 && tempCodePoint < 1114112) {
                    codePoint = tempCodePoint;
                  }
                }
            }
          }
          if (codePoint === null) {
            codePoint = 65533;
            bytesPerSequence = 1;
          } else if (codePoint > 65535) {
            codePoint -= 65536;
            res.push(codePoint >>> 10 & 1023 | 55296);
            codePoint = 56320 | codePoint & 1023;
          }
          res.push(codePoint);
          i += bytesPerSequence;
        }
        return decodeCodePointsArray(res);
      }
      var MAX_ARGUMENTS_LENGTH = 4096;
      function decodeCodePointsArray(codePoints) {
        const len = codePoints.length;
        if (len <= MAX_ARGUMENTS_LENGTH) {
          return String.fromCharCode.apply(String, codePoints);
        }
        let res = "";
        let i = 0;
        while (i < len) {
          res += String.fromCharCode.apply(
            String,
            codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
          );
        }
        return res;
      }
      function asciiSlice(buf, start, end) {
        let ret = "";
        end = Math.min(buf.length, end);
        for (let i = start; i < end; ++i) {
          ret += String.fromCharCode(buf[i] & 127);
        }
        return ret;
      }
      function latin1Slice(buf, start, end) {
        let ret = "";
        end = Math.min(buf.length, end);
        for (let i = start; i < end; ++i) {
          ret += String.fromCharCode(buf[i]);
        }
        return ret;
      }
      function hexSlice(buf, start, end) {
        const len = buf.length;
        if (!start || start < 0) start = 0;
        if (!end || end < 0 || end > len) end = len;
        let out = "";
        for (let i = start; i < end; ++i) {
          out += hexSliceLookupTable[buf[i]];
        }
        return out;
      }
      function utf16leSlice(buf, start, end) {
        const bytes = buf.slice(start, end);
        let res = "";
        for (let i = 0; i < bytes.length - 1; i += 2) {
          res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
        }
        return res;
      }
      Buffer3.prototype.slice = function slice(start, end) {
        const len = this.length;
        start = ~~start;
        end = end === void 0 ? len : ~~end;
        if (start < 0) {
          start += len;
          if (start < 0) start = 0;
        } else if (start > len) {
          start = len;
        }
        if (end < 0) {
          end += len;
          if (end < 0) end = 0;
        } else if (end > len) {
          end = len;
        }
        if (end < start) end = start;
        const newBuf = this.subarray(start, end);
        Object.setPrototypeOf(newBuf, Buffer3.prototype);
        return newBuf;
      };
      function checkOffset(offset, ext, length) {
        if (offset % 1 !== 0 || offset < 0) throw new RangeError("offset is not uint");
        if (offset + ext > length) throw new RangeError("Trying to access beyond buffer length");
      }
      Buffer3.prototype.readUintLE = Buffer3.prototype.readUIntLE = function readUIntLE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let val = this[offset];
        let mul = 1;
        let i = 0;
        while (++i < byteLength2 && (mul *= 256)) {
          val += this[offset + i] * mul;
        }
        return val;
      };
      Buffer3.prototype.readUintBE = Buffer3.prototype.readUIntBE = function readUIntBE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          checkOffset(offset, byteLength2, this.length);
        }
        let val = this[offset + --byteLength2];
        let mul = 1;
        while (byteLength2 > 0 && (mul *= 256)) {
          val += this[offset + --byteLength2] * mul;
        }
        return val;
      };
      Buffer3.prototype.readUint8 = Buffer3.prototype.readUInt8 = function readUInt8(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 1, this.length);
        return this[offset];
      };
      Buffer3.prototype.readUint16LE = Buffer3.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        return this[offset] | this[offset + 1] << 8;
      };
      Buffer3.prototype.readUint16BE = Buffer3.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        return this[offset] << 8 | this[offset + 1];
      };
      Buffer3.prototype.readUint32LE = Buffer3.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 16777216;
      };
      Buffer3.prototype.readUint32BE = Buffer3.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] * 16777216 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
      };
      Buffer3.prototype.readBigUInt64LE = defineBigIntMethod(function readBigUInt64LE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const lo = first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24;
        const hi = this[++offset] + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + last * 2 ** 24;
        return BigInt(lo) + (BigInt(hi) << BigInt(32));
      });
      Buffer3.prototype.readBigUInt64BE = defineBigIntMethod(function readBigUInt64BE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const hi = first * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
        const lo = this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last;
        return (BigInt(hi) << BigInt(32)) + BigInt(lo);
      });
      Buffer3.prototype.readIntLE = function readIntLE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let val = this[offset];
        let mul = 1;
        let i = 0;
        while (++i < byteLength2 && (mul *= 256)) {
          val += this[offset + i] * mul;
        }
        mul *= 128;
        if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
        return val;
      };
      Buffer3.prototype.readIntBE = function readIntBE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let i = byteLength2;
        let mul = 1;
        let val = this[offset + --i];
        while (i > 0 && (mul *= 256)) {
          val += this[offset + --i] * mul;
        }
        mul *= 128;
        if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
        return val;
      };
      Buffer3.prototype.readInt8 = function readInt8(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 1, this.length);
        if (!(this[offset] & 128)) return this[offset];
        return (255 - this[offset] + 1) * -1;
      };
      Buffer3.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        const val = this[offset] | this[offset + 1] << 8;
        return val & 32768 ? val | 4294901760 : val;
      };
      Buffer3.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        const val = this[offset + 1] | this[offset] << 8;
        return val & 32768 ? val | 4294901760 : val;
      };
      Buffer3.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24;
      };
      Buffer3.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3];
      };
      Buffer3.prototype.readBigInt64LE = defineBigIntMethod(function readBigInt64LE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const val = this[offset + 4] + this[offset + 5] * 2 ** 8 + this[offset + 6] * 2 ** 16 + (last << 24);
        return (BigInt(val) << BigInt(32)) + BigInt(first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24);
      });
      Buffer3.prototype.readBigInt64BE = defineBigIntMethod(function readBigInt64BE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const val = (first << 24) + // Overflow
        this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
        return (BigInt(val) << BigInt(32)) + BigInt(this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last);
      });
      Buffer3.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return ieee754.read(this, offset, true, 23, 4);
      };
      Buffer3.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return ieee754.read(this, offset, false, 23, 4);
      };
      Buffer3.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 8, this.length);
        return ieee754.read(this, offset, true, 52, 8);
      };
      Buffer3.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 8, this.length);
        return ieee754.read(this, offset, false, 52, 8);
      };
      function checkInt(buf, value, offset, ext, max, min) {
        if (!Buffer3.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance');
        if (value > max || value < min) throw new RangeError('"value" argument is out of bounds');
        if (offset + ext > buf.length) throw new RangeError("Index out of range");
      }
      Buffer3.prototype.writeUintLE = Buffer3.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
          checkInt(this, value, offset, byteLength2, maxBytes, 0);
        }
        let mul = 1;
        let i = 0;
        this[offset] = value & 255;
        while (++i < byteLength2 && (mul *= 256)) {
          this[offset + i] = value / mul & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeUintBE = Buffer3.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
          checkInt(this, value, offset, byteLength2, maxBytes, 0);
        }
        let i = byteLength2 - 1;
        let mul = 1;
        this[offset + i] = value & 255;
        while (--i >= 0 && (mul *= 256)) {
          this[offset + i] = value / mul & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeUint8 = Buffer3.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 1, 255, 0);
        this[offset] = value & 255;
        return offset + 1;
      };
      Buffer3.prototype.writeUint16LE = Buffer3.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        return offset + 2;
      };
      Buffer3.prototype.writeUint16BE = Buffer3.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
        this[offset] = value >>> 8;
        this[offset + 1] = value & 255;
        return offset + 2;
      };
      Buffer3.prototype.writeUint32LE = Buffer3.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
        this[offset + 3] = value >>> 24;
        this[offset + 2] = value >>> 16;
        this[offset + 1] = value >>> 8;
        this[offset] = value & 255;
        return offset + 4;
      };
      Buffer3.prototype.writeUint32BE = Buffer3.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
        this[offset] = value >>> 24;
        this[offset + 1] = value >>> 16;
        this[offset + 2] = value >>> 8;
        this[offset + 3] = value & 255;
        return offset + 4;
      };
      function wrtBigUInt64LE(buf, value, offset, min, max) {
        checkIntBI(value, min, max, buf, offset, 7);
        let lo = Number(value & BigInt(4294967295));
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        let hi = Number(value >> BigInt(32) & BigInt(4294967295));
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        return offset;
      }
      function wrtBigUInt64BE(buf, value, offset, min, max) {
        checkIntBI(value, min, max, buf, offset, 7);
        let lo = Number(value & BigInt(4294967295));
        buf[offset + 7] = lo;
        lo = lo >> 8;
        buf[offset + 6] = lo;
        lo = lo >> 8;
        buf[offset + 5] = lo;
        lo = lo >> 8;
        buf[offset + 4] = lo;
        let hi = Number(value >> BigInt(32) & BigInt(4294967295));
        buf[offset + 3] = hi;
        hi = hi >> 8;
        buf[offset + 2] = hi;
        hi = hi >> 8;
        buf[offset + 1] = hi;
        hi = hi >> 8;
        buf[offset] = hi;
        return offset + 8;
      }
      Buffer3.prototype.writeBigUInt64LE = defineBigIntMethod(function writeBigUInt64LE(value, offset = 0) {
        return wrtBigUInt64LE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
      });
      Buffer3.prototype.writeBigUInt64BE = defineBigIntMethod(function writeBigUInt64BE(value, offset = 0) {
        return wrtBigUInt64BE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
      });
      Buffer3.prototype.writeIntLE = function writeIntLE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          const limit = Math.pow(2, 8 * byteLength2 - 1);
          checkInt(this, value, offset, byteLength2, limit - 1, -limit);
        }
        let i = 0;
        let mul = 1;
        let sub = 0;
        this[offset] = value & 255;
        while (++i < byteLength2 && (mul *= 256)) {
          if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
            sub = 1;
          }
          this[offset + i] = (value / mul >> 0) - sub & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeIntBE = function writeIntBE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          const limit = Math.pow(2, 8 * byteLength2 - 1);
          checkInt(this, value, offset, byteLength2, limit - 1, -limit);
        }
        let i = byteLength2 - 1;
        let mul = 1;
        let sub = 0;
        this[offset + i] = value & 255;
        while (--i >= 0 && (mul *= 256)) {
          if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
            sub = 1;
          }
          this[offset + i] = (value / mul >> 0) - sub & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 1, 127, -128);
        if (value < 0) value = 255 + value + 1;
        this[offset] = value & 255;
        return offset + 1;
      };
      Buffer3.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        return offset + 2;
      };
      Buffer3.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
        this[offset] = value >>> 8;
        this[offset + 1] = value & 255;
        return offset + 2;
      };
      Buffer3.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        this[offset + 2] = value >>> 16;
        this[offset + 3] = value >>> 24;
        return offset + 4;
      };
      Buffer3.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
        if (value < 0) value = 4294967295 + value + 1;
        this[offset] = value >>> 24;
        this[offset + 1] = value >>> 16;
        this[offset + 2] = value >>> 8;
        this[offset + 3] = value & 255;
        return offset + 4;
      };
      Buffer3.prototype.writeBigInt64LE = defineBigIntMethod(function writeBigInt64LE(value, offset = 0) {
        return wrtBigUInt64LE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
      });
      Buffer3.prototype.writeBigInt64BE = defineBigIntMethod(function writeBigInt64BE(value, offset = 0) {
        return wrtBigUInt64BE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
      });
      function checkIEEE754(buf, value, offset, ext, max, min) {
        if (offset + ext > buf.length) throw new RangeError("Index out of range");
        if (offset < 0) throw new RangeError("Index out of range");
      }
      function writeFloat(buf, value, offset, littleEndian, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          checkIEEE754(buf, value, offset, 4, 34028234663852886e22, -34028234663852886e22);
        }
        ieee754.write(buf, value, offset, littleEndian, 23, 4);
        return offset + 4;
      }
      Buffer3.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
        return writeFloat(this, value, offset, true, noAssert);
      };
      Buffer3.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
        return writeFloat(this, value, offset, false, noAssert);
      };
      function writeDouble(buf, value, offset, littleEndian, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          checkIEEE754(buf, value, offset, 8, 17976931348623157e292, -17976931348623157e292);
        }
        ieee754.write(buf, value, offset, littleEndian, 52, 8);
        return offset + 8;
      }
      Buffer3.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
        return writeDouble(this, value, offset, true, noAssert);
      };
      Buffer3.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
        return writeDouble(this, value, offset, false, noAssert);
      };
      Buffer3.prototype.copy = function copy(target, targetStart, start, end) {
        if (!Buffer3.isBuffer(target)) throw new TypeError("argument should be a Buffer");
        if (!start) start = 0;
        if (!end && end !== 0) end = this.length;
        if (targetStart >= target.length) targetStart = target.length;
        if (!targetStart) targetStart = 0;
        if (end > 0 && end < start) end = start;
        if (end === start) return 0;
        if (target.length === 0 || this.length === 0) return 0;
        if (targetStart < 0) {
          throw new RangeError("targetStart out of bounds");
        }
        if (start < 0 || start >= this.length) throw new RangeError("Index out of range");
        if (end < 0) throw new RangeError("sourceEnd out of bounds");
        if (end > this.length) end = this.length;
        if (target.length - targetStart < end - start) {
          end = target.length - targetStart + start;
        }
        const len = end - start;
        if (this === target && typeof Uint8Array.prototype.copyWithin === "function") {
          this.copyWithin(targetStart, start, end);
        } else {
          Uint8Array.prototype.set.call(
            target,
            this.subarray(start, end),
            targetStart
          );
        }
        return len;
      };
      Buffer3.prototype.fill = function fill(val, start, end, encoding) {
        if (typeof val === "string") {
          if (typeof start === "string") {
            encoding = start;
            start = 0;
            end = this.length;
          } else if (typeof end === "string") {
            encoding = end;
            end = this.length;
          }
          if (encoding !== void 0 && typeof encoding !== "string") {
            throw new TypeError("encoding must be a string");
          }
          if (typeof encoding === "string" && !Buffer3.isEncoding(encoding)) {
            throw new TypeError("Unknown encoding: " + encoding);
          }
          if (val.length === 1) {
            const code = val.charCodeAt(0);
            if (encoding === "utf8" && code < 128 || encoding === "latin1") {
              val = code;
            }
          }
        } else if (typeof val === "number") {
          val = val & 255;
        } else if (typeof val === "boolean") {
          val = Number(val);
        }
        if (start < 0 || this.length < start || this.length < end) {
          throw new RangeError("Out of range index");
        }
        if (end <= start) {
          return this;
        }
        start = start >>> 0;
        end = end === void 0 ? this.length : end >>> 0;
        if (!val) val = 0;
        let i;
        if (typeof val === "number") {
          for (i = start; i < end; ++i) {
            this[i] = val;
          }
        } else {
          const bytes = Buffer3.isBuffer(val) ? val : Buffer3.from(val, encoding);
          const len = bytes.length;
          if (len === 0) {
            throw new TypeError('The value "' + val + '" is invalid for argument "value"');
          }
          for (i = 0; i < end - start; ++i) {
            this[i + start] = bytes[i % len];
          }
        }
        return this;
      };
      var errors = {};
      function E(sym, getMessage, Base) {
        errors[sym] = class NodeError extends Base {
          constructor() {
            super();
            Object.defineProperty(this, "message", {
              value: getMessage.apply(this, arguments),
              writable: true,
              configurable: true
            });
            this.name = `${this.name} [${sym}]`;
            this.stack;
            delete this.name;
          }
          get code() {
            return sym;
          }
          set code(value) {
            Object.defineProperty(this, "code", {
              configurable: true,
              enumerable: true,
              value,
              writable: true
            });
          }
          toString() {
            return `${this.name} [${sym}]: ${this.message}`;
          }
        };
      }
      E(
        "ERR_BUFFER_OUT_OF_BOUNDS",
        function(name) {
          if (name) {
            return `${name} is outside of buffer bounds`;
          }
          return "Attempt to access memory outside buffer bounds";
        },
        RangeError
      );
      E(
        "ERR_INVALID_ARG_TYPE",
        function(name, actual) {
          return `The "${name}" argument must be of type number. Received type ${typeof actual}`;
        },
        TypeError
      );
      E(
        "ERR_OUT_OF_RANGE",
        function(str, range, input) {
          let msg = `The value of "${str}" is out of range.`;
          let received = input;
          if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
            received = addNumericalSeparator(String(input));
          } else if (typeof input === "bigint") {
            received = String(input);
            if (input > BigInt(2) ** BigInt(32) || input < -(BigInt(2) ** BigInt(32))) {
              received = addNumericalSeparator(received);
            }
            received += "n";
          }
          msg += ` It must be ${range}. Received ${received}`;
          return msg;
        },
        RangeError
      );
      function addNumericalSeparator(val) {
        let res = "";
        let i = val.length;
        const start = val[0] === "-" ? 1 : 0;
        for (; i >= start + 4; i -= 3) {
          res = `_${val.slice(i - 3, i)}${res}`;
        }
        return `${val.slice(0, i)}${res}`;
      }
      function checkBounds(buf, offset, byteLength2) {
        validateNumber(offset, "offset");
        if (buf[offset] === void 0 || buf[offset + byteLength2] === void 0) {
          boundsError(offset, buf.length - (byteLength2 + 1));
        }
      }
      function checkIntBI(value, min, max, buf, offset, byteLength2) {
        if (value > max || value < min) {
          const n = typeof min === "bigint" ? "n" : "";
          let range;
          if (byteLength2 > 3) {
            if (min === 0 || min === BigInt(0)) {
              range = `>= 0${n} and < 2${n} ** ${(byteLength2 + 1) * 8}${n}`;
            } else {
              range = `>= -(2${n} ** ${(byteLength2 + 1) * 8 - 1}${n}) and < 2 ** ${(byteLength2 + 1) * 8 - 1}${n}`;
            }
          } else {
            range = `>= ${min}${n} and <= ${max}${n}`;
          }
          throw new errors.ERR_OUT_OF_RANGE("value", range, value);
        }
        checkBounds(buf, offset, byteLength2);
      }
      function validateNumber(value, name) {
        if (typeof value !== "number") {
          throw new errors.ERR_INVALID_ARG_TYPE(name, "number", value);
        }
      }
      function boundsError(value, length, type) {
        if (Math.floor(value) !== value) {
          validateNumber(value, type);
          throw new errors.ERR_OUT_OF_RANGE(type || "offset", "an integer", value);
        }
        if (length < 0) {
          throw new errors.ERR_BUFFER_OUT_OF_BOUNDS();
        }
        throw new errors.ERR_OUT_OF_RANGE(
          type || "offset",
          `>= ${type ? 1 : 0} and <= ${length}`,
          value
        );
      }
      var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;
      function base64clean(str) {
        str = str.split("=")[0];
        str = str.trim().replace(INVALID_BASE64_RE, "");
        if (str.length < 2) return "";
        while (str.length % 4 !== 0) {
          str = str + "=";
        }
        return str;
      }
      function utf8ToBytes(string, units) {
        units = units || Infinity;
        let codePoint;
        const length = string.length;
        let leadSurrogate = null;
        const bytes = [];
        for (let i = 0; i < length; ++i) {
          codePoint = string.charCodeAt(i);
          if (codePoint > 55295 && codePoint < 57344) {
            if (!leadSurrogate) {
              if (codePoint > 56319) {
                if ((units -= 3) > -1) bytes.push(239, 191, 189);
                continue;
              } else if (i + 1 === length) {
                if ((units -= 3) > -1) bytes.push(239, 191, 189);
                continue;
              }
              leadSurrogate = codePoint;
              continue;
            }
            if (codePoint < 56320) {
              if ((units -= 3) > -1) bytes.push(239, 191, 189);
              leadSurrogate = codePoint;
              continue;
            }
            codePoint = (leadSurrogate - 55296 << 10 | codePoint - 56320) + 65536;
          } else if (leadSurrogate) {
            if ((units -= 3) > -1) bytes.push(239, 191, 189);
          }
          leadSurrogate = null;
          if (codePoint < 128) {
            if ((units -= 1) < 0) break;
            bytes.push(codePoint);
          } else if (codePoint < 2048) {
            if ((units -= 2) < 0) break;
            bytes.push(
              codePoint >> 6 | 192,
              codePoint & 63 | 128
            );
          } else if (codePoint < 65536) {
            if ((units -= 3) < 0) break;
            bytes.push(
              codePoint >> 12 | 224,
              codePoint >> 6 & 63 | 128,
              codePoint & 63 | 128
            );
          } else if (codePoint < 1114112) {
            if ((units -= 4) < 0) break;
            bytes.push(
              codePoint >> 18 | 240,
              codePoint >> 12 & 63 | 128,
              codePoint >> 6 & 63 | 128,
              codePoint & 63 | 128
            );
          } else {
            throw new Error("Invalid code point");
          }
        }
        return bytes;
      }
      function asciiToBytes(str) {
        const byteArray = [];
        for (let i = 0; i < str.length; ++i) {
          byteArray.push(str.charCodeAt(i) & 255);
        }
        return byteArray;
      }
      function utf16leToBytes(str, units) {
        let c, hi, lo;
        const byteArray = [];
        for (let i = 0; i < str.length; ++i) {
          if ((units -= 2) < 0) break;
          c = str.charCodeAt(i);
          hi = c >> 8;
          lo = c % 256;
          byteArray.push(lo);
          byteArray.push(hi);
        }
        return byteArray;
      }
      function base64ToBytes(str) {
        return base64.toByteArray(base64clean(str));
      }
      function blitBuffer(src, dst, offset, length) {
        let i;
        for (i = 0; i < length; ++i) {
          if (i + offset >= dst.length || i >= src.length) break;
          dst[i + offset] = src[i];
        }
        return i;
      }
      function isInstance(obj, type) {
        return obj instanceof type || obj != null && obj.constructor != null && obj.constructor.name != null && obj.constructor.name === type.name;
      }
      function numberIsNaN(obj) {
        return obj !== obj;
      }
      var hexSliceLookupTable = function() {
        const alphabet = "0123456789abcdef";
        const table = new Array(256);
        for (let i = 0; i < 16; ++i) {
          const i16 = i * 16;
          for (let j = 0; j < 16; ++j) {
            table[i16 + j] = alphabet[i] + alphabet[j];
          }
        }
        return table;
      }();
      function defineBigIntMethod(fn) {
        return typeof BigInt === "undefined" ? BufferBigIntNotDefined : fn;
      }
      function BufferBigIntNotDefined() {
        throw new Error("BigInt not supported");
      }
    }
  });

  // react/craft-inspect-buffer-shim.js
  var import_buffer;
  var init_craft_inspect_buffer_shim = __esm({
    "react/craft-inspect-buffer-shim.js"() {
      import_buffer = __toESM(require_buffer());
      if (typeof globalThis.Buffer === "undefined") {
        globalThis.Buffer = import_buffer.Buffer;
      }
    }
  });

  // node_modules/@vlydev/cs2-masked-inspect/src/ItemPreviewData.js
  var require_ItemPreviewData = __commonJS({
    "node_modules/@vlydev/cs2-masked-inspect/src/ItemPreviewData.js"(exports, module) {
      "use strict";
      init_craft_inspect_buffer_shim();
      var ItemPreviewData = class {
        /**
         * @param {object} [opts]
         * @param {number}  [opts.accountId=0]
         * @param {number}  [opts.itemId=0]
         * @param {number}  [opts.defIndex=0]
         * @param {number}  [opts.paintIndex=0]
         * @param {number}  [opts.rarity=0]
         * @param {number}  [opts.quality=0]
         * @param {number|null} [opts.paintWear=null]
         * @param {number}  [opts.paintSeed=0]
         * @param {number}  [opts.killEaterScoreType=0]
         * @param {number}  [opts.killEaterValue=0]
         * @param {string}  [opts.customName='']
         * @param {import('./Sticker')[]} [opts.stickers=[]]
         * @param {number}  [opts.inventory=0]
         * @param {number}  [opts.origin=0]
         * @param {number}  [opts.questId=0]
         * @param {number}  [opts.dropReason=0]
         * @param {number}  [opts.musicIndex=0]
         * @param {number}  [opts.entIndex=0]
         * @param {number}  [opts.petIndex=0]
         * @param {import('./Sticker')[]} [opts.keychains=[]]
         */
        constructor({
          accountId = 0,
          itemId = 0,
          defIndex = 0,
          paintIndex = 0,
          rarity = 0,
          quality = 0,
          paintWear = null,
          paintSeed = 0,
          killEaterScoreType = 0,
          killEaterValue = 0,
          customName = "",
          stickers = [],
          inventory = 0,
          origin = 0,
          questId = 0,
          dropReason = 0,
          musicIndex = 0,
          entIndex = 0,
          petIndex = 0,
          keychains = []
        } = {}) {
          this.accountId = accountId;
          this.itemId = itemId;
          this.defIndex = defIndex;
          this.paintIndex = paintIndex;
          this.rarity = rarity;
          this.quality = quality;
          this.paintWear = paintWear;
          this.paintSeed = paintSeed;
          this.killEaterScoreType = killEaterScoreType;
          this.killEaterValue = killEaterValue;
          this.customName = customName;
          this.stickers = stickers;
          this.inventory = inventory;
          this.origin = origin;
          this.questId = questId;
          this.dropReason = dropReason;
          this.musicIndex = musicIndex;
          this.entIndex = entIndex;
          this.petIndex = petIndex;
          this.keychains = keychains;
        }
      };
      module.exports = ItemPreviewData;
    }
  });

  // node_modules/@vlydev/cs2-masked-inspect/src/Sticker.js
  var require_Sticker = __commonJS({
    "node_modules/@vlydev/cs2-masked-inspect/src/Sticker.js"(exports, module) {
      "use strict";
      init_craft_inspect_buffer_shim();
      var Sticker = class {
        /**
         * @param {object} [opts]
         * @param {number}  [opts.slot=0]
         * @param {number}  [opts.stickerId=0]
         * @param {number|null} [opts.wear=null]
         * @param {number|null} [opts.scale=null]
         * @param {number|null} [opts.rotation=null]
         * @param {number}  [opts.tintId=0]
         * @param {number|null} [opts.offsetX=null]
         * @param {number|null} [opts.offsetY=null]
         * @param {number|null} [opts.offsetZ=null]
         * @param {number}  [opts.pattern=0]
         * @param {number|null} [opts.highlightReel=null]
         * @param {number|null} [opts.paintKit=null]
         */
        constructor({
          slot = 0,
          stickerId = 0,
          wear = null,
          scale = null,
          rotation = null,
          tintId = 0,
          offsetX = null,
          offsetY = null,
          offsetZ = null,
          pattern = 0,
          highlightReel = null,
          paintKit = null
        } = {}) {
          this.slot = slot;
          this.stickerId = stickerId;
          this.wear = wear;
          this.scale = scale;
          this.rotation = rotation;
          this.tintId = tintId;
          this.offsetX = offsetX;
          this.offsetY = offsetY;
          this.offsetZ = offsetZ;
          this.pattern = pattern;
          this.highlightReel = highlightReel;
          this.paintKit = paintKit;
        }
      };
      module.exports = Sticker;
    }
  });

  // node_modules/@vlydev/cs2-masked-inspect/src/MalformedInspectLinkError.js
  var require_MalformedInspectLinkError = __commonJS({
    "node_modules/@vlydev/cs2-masked-inspect/src/MalformedInspectLinkError.js"(exports, module) {
      "use strict";
      init_craft_inspect_buffer_shim();
      var MalformedInspectLinkError = class extends Error {
        constructor(message, options) {
          super(message, options);
          this.name = "MalformedInspectLinkError";
        }
      };
      module.exports = MalformedInspectLinkError;
    }
  });

  // node_modules/@vlydev/cs2-masked-inspect/src/proto/reader.js
  var require_reader = __commonJS({
    "node_modules/@vlydev/cs2-masked-inspect/src/proto/reader.js"(exports, module) {
      "use strict";
      init_craft_inspect_buffer_shim();
      var WIRE_VARINT = 0;
      var WIRE_64BIT = 1;
      var WIRE_LEN = 2;
      var WIRE_32BIT = 5;
      var ProtoReader = class {
        /**
         * @param {Buffer} data
         */
        constructor(data) {
          this._data = data;
          this._pos = 0;
        }
        get pos() {
          return this._pos;
        }
        remaining() {
          return this._data.length - this._pos;
        }
        readByte() {
          if (this._pos >= this._data.length) {
            throw new RangeError("Unexpected end of protobuf data");
          }
          return this._data[this._pos++];
        }
        readBytes(n) {
          if (this._pos + n > this._data.length) {
            throw new RangeError(
              `Need ${n} bytes but only ${this._data.length - this._pos} remain`
            );
          }
          const chunk = this._data.slice(this._pos, this._pos + n);
          this._pos += n;
          return chunk;
        }
        /**
         * Read a base-128 varint.
         * Returns a BigInt for 64-bit range safety; callers convert as needed.
         *
         * @returns {bigint}
         */
        readVarint() {
          let result = 0n;
          let shift = 0n;
          while (true) {
            const b = this.readByte();
            result |= BigInt(b & 127) << shift;
            if (!(b & 128)) break;
            shift += 7n;
            if (shift > 63n) {
              throw new RangeError("Varint too long");
            }
          }
          return result;
        }
        /**
         * Read tag and return [fieldNumber, wireType].
         *
         * @returns {[number, number]}
         */
        readTag() {
          const tag = this.readVarint();
          return [Number(tag >> 3n), Number(tag & 7n)];
        }
        readLengthDelimited() {
          const length = Number(this.readVarint());
          return this.readBytes(length);
        }
        /**
         * Read all fields until EOF.
         *
         * @returns {Array<{field: number, wire: number, value: bigint|Buffer}>}
         */
        readAllFields() {
          const fields = [];
          let fieldCount = 0;
          while (this.remaining() > 0) {
            if (++fieldCount > 100) {
              throw new RangeError("Protobuf field count exceeds limit of 100");
            }
            const [fieldNum, wireType] = this.readTag();
            let value;
            switch (wireType) {
              case WIRE_VARINT:
                value = this.readVarint();
                break;
              case WIRE_64BIT:
                value = this.readBytes(8);
                break;
              case WIRE_LEN:
                value = this.readLengthDelimited();
                break;
              case WIRE_32BIT:
                value = this.readBytes(4);
                break;
              default:
                throw new RangeError(
                  `Unknown wire type ${wireType} for field ${fieldNum}`
                );
            }
            fields.push({ field: fieldNum, wire: wireType, value });
          }
          return fields;
        }
      };
      module.exports = { ProtoReader, WIRE_VARINT, WIRE_64BIT, WIRE_LEN, WIRE_32BIT };
    }
  });

  // node_modules/@vlydev/cs2-masked-inspect/src/proto/writer.js
  var require_writer = __commonJS({
    "node_modules/@vlydev/cs2-masked-inspect/src/proto/writer.js"(exports, module) {
      "use strict";
      init_craft_inspect_buffer_shim();
      var WIRE_VARINT = 0;
      var WIRE_LEN = 2;
      var WIRE_32BIT = 5;
      var ProtoWriter = class {
        constructor() {
          this._buf = [];
        }
        toBytes() {
          return Buffer.concat(this._buf);
        }
        // ------------------------------------------------------------------
        // Low-level primitives
        // ------------------------------------------------------------------
        /**
         * @param {bigint|number} value
         */
        _writeVarint(value) {
          let v = BigInt(value);
          if (v < 0n) {
            v = BigInt.asUintN(64, v);
          }
          const parts = [];
          do {
            let b = Number(v & 0x7Fn);
            v >>= 7n;
            if (v !== 0n) b |= 128;
            parts.push(b);
          } while (v !== 0n);
          this._buf.push(Buffer.from(parts));
        }
        _writeTag(fieldNum, wireType) {
          this._writeVarint(fieldNum << 3 | wireType);
        }
        // ------------------------------------------------------------------
        // Public field writers
        // ------------------------------------------------------------------
        /**
         * @param {number} fieldNum
         * @param {number|bigint} value
         */
        writeUint32(fieldNum, value) {
          if (value === 0 || value === 0n) return;
          this._writeTag(fieldNum, WIRE_VARINT);
          this._writeVarint(value);
        }
        /**
         * @param {number} fieldNum
         * @param {number|bigint} value
         */
        writeUint64(fieldNum, value) {
          if (value === 0 || value === 0n) return;
          this._writeTag(fieldNum, WIRE_VARINT);
          this._writeVarint(value);
        }
        /**
         * @param {number} fieldNum
         * @param {number|bigint} value
         */
        writeInt32(fieldNum, value) {
          if (value === 0 || value === 0n) return;
          this._writeTag(fieldNum, WIRE_VARINT);
          this._writeVarint(value);
        }
        /**
         * @param {number} fieldNum
         * @param {string} value
         */
        writeString(fieldNum, value) {
          if (!value) return;
          const encoded = Buffer.from(value, "utf8");
          this._writeTag(fieldNum, WIRE_LEN);
          this._writeVarint(encoded.length);
          this._buf.push(encoded);
        }
        /**
         * Write a float32 as wire type 5 (fixed 32-bit, little-endian).
         * Used for sticker float fields (wear, scale, rotation, etc.).
         *
         * @param {number} fieldNum
         * @param {number} value
         */
        writeFloat32Fixed(fieldNum, value) {
          this._writeTag(fieldNum, WIRE_32BIT);
          const b = Buffer.alloc(4);
          b.writeFloatLE(value, 0);
          this._buf.push(b);
        }
        /**
         * Write raw bytes as a length-delimited field (wire type 2).
         *
         * @param {number} fieldNum
         * @param {Buffer} data
         */
        writeRawBytes(fieldNum, data) {
          if (!data || data.length === 0) return;
          this._writeTag(fieldNum, WIRE_LEN);
          this._writeVarint(data.length);
          this._buf.push(data);
        }
        /**
         * Write a nested message (another ProtoWriter's output) as a length-delimited field.
         *
         * @param {number} fieldNum
         * @param {ProtoWriter} nested
         */
        writeEmbedded(fieldNum, nested) {
          this.writeRawBytes(fieldNum, nested.toBytes());
        }
      };
      module.exports = { ProtoWriter, WIRE_VARINT, WIRE_LEN, WIRE_32BIT };
    }
  });

  // node_modules/@vlydev/cs2-masked-inspect/src/InspectLink.js
  var require_InspectLink = __commonJS({
    "node_modules/@vlydev/cs2-masked-inspect/src/InspectLink.js"(exports, module) {
      "use strict";
      init_craft_inspect_buffer_shim();
      var ItemPreviewData = require_ItemPreviewData();
      var Sticker = require_Sticker();
      var MalformedInspectLinkError = require_MalformedInspectLinkError();
      var { ProtoReader } = require_reader();
      var { ProtoWriter } = require_writer();
      var CRC32_TABLE = (() => {
        const table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
          let c = i;
          for (let j = 0; j < 8; j++) {
            c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
          }
          table[i] = c;
        }
        return table;
      })();
      function crc32(buf) {
        let crc = 4294967295;
        for (let i = 0; i < buf.length; i++) {
          crc = crc >>> 8 ^ CRC32_TABLE[(crc ^ buf[i]) & 255];
        }
        return (crc ^ 4294967295) >>> 0;
      }
      function computeChecksum(buffer, protoLen) {
        const crcVal = crc32(buffer);
        const val = BigInt((crcVal & 65535 ^ protoLen * crcVal) >>> 0) & 0xFFFFFFFFn;
        const result = Buffer.alloc(4);
        result.writeUInt32BE(Number(val), 0);
        return result;
      }
      function float32ToUint32(f) {
        const dv = new DataView(new ArrayBuffer(4));
        dv.setFloat32(0, f, true);
        return dv.getUint32(0, true);
      }
      function uint32ToFloat32(u) {
        const dv = new DataView(new ArrayBuffer(4));
        dv.setUint32(0, u >>> 0, true);
        return dv.getFloat32(0, true);
      }
      var INSPECT_URL_RE = /(?:%20|\s|\+)A([0-9A-Fa-f]+)/i;
      var HYBRID_URL_RE = /S\d+A\d+D([0-9A-Fa-f]+)$/i;
      var CLASSIC_URL_RE = /csgo_econ_action_preview(?:%20|\s)[SM]\d+A\d+D\d+$/i;
      var MASKED_URL_RE = /csgo_econ_action_preview(?:%20|\s)%?[0-9A-Fa-f]{10,}$/i;
      function extractHex(input) {
        const stripped = input.trim();
        const mh = stripped.match(HYBRID_URL_RE);
        if (mh && /[A-Fa-f]/.test(mh[1])) return mh[1];
        const m = stripped.match(INSPECT_URL_RE);
        if (m && m[1].length % 2 === 0) return m[1];
        const mm = stripped.match(/csgo_econ_action_preview(?:%20|\s|\+)%?([0-9A-Fa-f]{10,})$/i);
        if (mm) return mm[1];
        return stripped.replace(/\s+/g, "");
      }
      function encodeSticker(s) {
        const w = new ProtoWriter();
        w.writeUint32(1, s.slot);
        w.writeUint32(2, s.stickerId);
        if (s.wear !== null) w.writeFloat32Fixed(3, s.wear);
        if (s.scale !== null) w.writeFloat32Fixed(4, s.scale);
        if (s.rotation !== null) w.writeFloat32Fixed(5, s.rotation);
        w.writeUint32(6, s.tintId);
        if (s.offsetX !== null) w.writeFloat32Fixed(7, s.offsetX);
        if (s.offsetY !== null) w.writeFloat32Fixed(8, s.offsetY);
        if (s.offsetZ !== null) w.writeFloat32Fixed(9, s.offsetZ);
        w.writeUint32(10, s.pattern);
        if (s.highlightReel != null) w.writeUint32(11, s.highlightReel);
        if (s.paintKit !== null) w.writeUint32(12, s.paintKit);
        return w.toBytes();
      }
      function decodeSticker(data) {
        const reader = new ProtoReader(data);
        const s = new Sticker();
        for (const f of reader.readAllFields()) {
          switch (f.field) {
            case 1:
              s.slot = Number(f.value);
              break;
            case 2:
              s.stickerId = Number(f.value);
              break;
            case 3:
              s.wear = f.value.readFloatLE(0);
              break;
            case 4:
              s.scale = f.value.readFloatLE(0);
              break;
            case 5:
              s.rotation = f.value.readFloatLE(0);
              break;
            case 6:
              s.tintId = Number(f.value);
              break;
            case 7:
              s.offsetX = f.value.readFloatLE(0);
              break;
            case 8:
              s.offsetY = f.value.readFloatLE(0);
              break;
            case 9:
              s.offsetZ = f.value.readFloatLE(0);
              break;
            case 10:
              s.pattern = Number(f.value);
              break;
            case 11:
              s.highlightReel = Number(f.value);
              break;
            case 12:
              s.paintKit = Number(f.value);
              break;
            default:
              break;
          }
        }
        return s;
      }
      function encodeItem(item) {
        const w = new ProtoWriter();
        w.writeUint32(1, item.accountId);
        w.writeUint64(2, item.itemId);
        w.writeUint32(3, item.defIndex);
        w.writeUint32(4, item.paintIndex);
        w.writeUint32(5, item.rarity);
        w.writeUint32(6, item.quality);
        if (item.paintWear != null) {
          w.writeUint32(7, float32ToUint32(item.paintWear));
        }
        w.writeUint32(8, item.paintSeed);
        w.writeUint32(9, item.killEaterScoreType);
        w.writeUint32(10, item.killEaterValue);
        w.writeString(11, item.customName);
        for (const sticker of item.stickers) {
          w.writeRawBytes(12, encodeSticker(sticker));
        }
        w.writeUint32(13, item.inventory);
        w.writeUint32(14, item.origin);
        w.writeUint32(15, item.questId);
        w.writeUint32(16, item.dropReason);
        w.writeUint32(17, item.musicIndex);
        w.writeInt32(18, item.entIndex);
        w.writeUint32(19, item.petIndex);
        for (const kc of item.keychains) {
          w.writeRawBytes(20, encodeSticker(kc));
        }
        return w.toBytes();
      }
      function decodeItem(data) {
        const reader = new ProtoReader(data);
        const item = new ItemPreviewData();
        for (const f of reader.readAllFields()) {
          switch (f.field) {
            case 1:
              item.accountId = Number(f.value);
              break;
            case 2:
              item.itemId = Number(f.value);
              break;
            case 3:
              item.defIndex = Number(f.value);
              break;
            case 4:
              item.paintIndex = Number(f.value);
              break;
            case 5:
              item.rarity = Number(f.value);
              break;
            case 6:
              item.quality = Number(f.value);
              break;
            case 7:
              item.paintWear = uint32ToFloat32(Number(f.value));
              break;
            case 8:
              item.paintSeed = Number(f.value);
              break;
            case 9:
              item.killEaterScoreType = Number(f.value);
              break;
            case 10:
              item.killEaterValue = Number(f.value);
              break;
            case 11:
              item.customName = f.value.toString("utf8");
              break;
            case 12:
              item.stickers.push(decodeSticker(f.value));
              break;
            case 13:
              item.inventory = Number(f.value);
              break;
            case 14:
              item.origin = Number(f.value);
              break;
            case 15:
              item.questId = Number(f.value);
              break;
            case 16:
              item.dropReason = Number(f.value);
              break;
            case 17:
              item.musicIndex = Number(f.value);
              break;
            case 18:
              item.entIndex = Number(f.value);
              break;
            case 19:
              item.petIndex = Number(f.value);
              break;
            case 20:
              item.keychains.push(decodeSticker(f.value));
              break;
            default:
              break;
          }
        }
        return item;
      }
      var InspectLink = class {
        /**
         * Encode an ItemPreviewData to an uppercase hex inspect-link payload.
         *
         * The returned string can be appended to a steam:// inspect URL or used
         * standalone. The key_byte is always 0x00 (no XOR applied).
         *
         * @param {ItemPreviewData} data
         * @returns {string} uppercase hex string
         */
        static serialize(data) {
          if (data.paintWear != null && (data.paintWear < 0 || data.paintWear > 1)) {
            throw new RangeError(
              `paintwear must be in [0.0, 1.0], got ${data.paintWear}`
            );
          }
          if (data.customName != null && data.customName.length > 100) {
            throw new RangeError(
              `customname must not exceed 100 characters, got ${data.customName.length}`
            );
          }
          const protoBytes = encodeItem(data);
          const buffer = Buffer.concat([Buffer.from([0]), protoBytes]);
          const checksum = computeChecksum(buffer, protoBytes.length);
          return Buffer.concat([buffer, checksum]).toString("hex").toUpperCase();
        }
        /**
         * Returns true if the link contains a decodable protobuf payload (can be decoded offline).
         * @param {string} link
         * @returns {boolean}
         */
        static isMasked(link) {
          const s = link.trim();
          if (MASKED_URL_RE.test(s)) return true;
          const m = s.match(HYBRID_URL_RE);
          return !!(m && /[A-Fa-f]/.test(m[1]));
        }
        /**
         * Returns true if the link is a classic S/A/D inspect URL with decimal did.
         * @param {string} link
         * @returns {boolean}
         */
        static isClassic(link) {
          return CLASSIC_URL_RE.test(link.trim());
        }
        /**
         * Decode an inspect-link hex payload (or full URL) into an ItemPreviewData.
         *
         * Accepts:
         *   - A raw uppercase or lowercase hex string
         *   - A full steam://rungame/... inspect URL
         *   - A CS2-style csgo://rungame/... URL
         *
         * Handles the XOR obfuscation used in native CS2 links.
         *
         * @param {string} input
         * @returns {ItemPreviewData}
         */
        static deserialize(input) {
          const hex = extractHex(input);
          if (hex.length > 4096) {
            throw new MalformedInspectLinkError(
              `Malformed inspect URL: payload too long (max 4096 hex chars). Input: "${abbreviate(input)}"`
            );
          }
          if (hex.length === 0 || hex.length % 2 !== 0) {
            throw new MalformedInspectLinkError(
              `Malformed inspect URL: hex payload has invalid length (${hex.length} chars, must be even and non-empty). The source likely truncated the URL. Input: "${abbreviate(input)}"`
            );
          }
          if (!/^[0-9A-Fa-f]+$/.test(hex)) {
            throw new MalformedInspectLinkError(
              `Malformed inspect URL: payload contains non-hex characters. Input: "${abbreviate(input)}"`
            );
          }
          const raw = Buffer.from(hex, "hex");
          if (raw.length < 6) {
            throw new MalformedInspectLinkError(
              `Malformed inspect URL: payload too short (${raw.length} bytes, need >=6). Input: "${abbreviate(input)}"`
            );
          }
          const key = raw[0];
          let decrypted;
          if (key === 0) {
            decrypted = raw;
          } else {
            decrypted = Buffer.alloc(raw.length);
            for (let i = 0; i < raw.length; i++) {
              decrypted[i] = raw[i] ^ key;
            }
          }
          const protoBytes = decrypted.slice(1, decrypted.length - 4);
          try {
            return decodeItem(protoBytes);
          } catch (e) {
            throw new MalformedInspectLinkError(
              `Malformed inspect URL: protobuf decode failed (${e && e.message ? e.message : e}). Payload likely corrupted or truncated. Input: "${abbreviate(input)}"`,
              { cause: e }
            );
          }
        }
      };
      function abbreviate(s) {
        return s.length > 120 ? s.slice(0, 100) + "..." : s;
      }
      module.exports = InspectLink;
    }
  });

  // node_modules/@vlydev/cs2-masked-inspect/src/GenCode.js
  var require_GenCode = __commonJS({
    "node_modules/@vlydev/cs2-masked-inspect/src/GenCode.js"(exports, module) {
      "use strict";
      init_craft_inspect_buffer_shim();
      var InspectLink = require_InspectLink();
      var ItemPreviewData = require_ItemPreviewData();
      var Sticker = require_Sticker();
      var INSPECT_BASE = "steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20";
      function formatFloat(value) {
        let s = value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
        return s || "0";
      }
      function serializeStickerPairs(stickers, padTo) {
        const result = [];
        const filtered = stickers.filter((s) => s.stickerId !== 0);
        if (padTo !== null && padTo !== void 0) {
          const slotMap = new Map(filtered.map((s) => [s.slot, s]));
          for (let slot = 0; slot < padTo; slot++) {
            const s = slotMap.get(slot);
            if (s) {
              result.push(String(s.stickerId));
              result.push(formatFloat(s.wear !== null ? s.wear : 0));
            } else {
              result.push("0", "0");
            }
          }
        } else {
          const sorted = [...filtered].sort((a, b) => a.slot - b.slot);
          for (const s of sorted) {
            result.push(String(s.stickerId));
            result.push(formatFloat(s.wear !== null ? s.wear : 0));
            if (s.paintKit != null) {
              result.push(String(s.paintKit));
            }
          }
        }
        return result;
      }
      function toGenCode(item, prefix = "!gen") {
        const wearStr = item.paintWear !== null ? formatFloat(item.paintWear) : "0";
        const parts = [
          String(item.defIndex),
          String(item.paintIndex),
          String(item.paintSeed),
          wearStr
        ];
        const hasStickers = item.stickers.some((s) => s.stickerId !== 0);
        const hasKeychains = item.keychains.some((s) => s.stickerId !== 0);
        if (hasStickers || hasKeychains) {
          parts.push(...serializeStickerPairs(item.stickers, 5));
          parts.push(...serializeStickerPairs(item.keychains, null));
        }
        const payload = parts.join(" ");
        return prefix ? `${prefix} ${payload}` : payload;
      }
      function generate(defIndex, paintIndex, paintSeed, paintWear, opts = {}) {
        const { rarity = 0, quality = 0, stickers = [], keychains = [] } = opts;
        const data = new ItemPreviewData({
          defIndex,
          paintIndex,
          paintSeed,
          paintWear,
          rarity,
          quality,
          stickers,
          keychains
        });
        const hex = InspectLink.serialize(data);
        return `${INSPECT_BASE}${hex}`;
      }
      function parseGenCode(genCode) {
        let tokens = genCode.trim().split(/\s+/);
        if (tokens[0] && tokens[0].startsWith("!")) {
          tokens = tokens.slice(1);
        }
        if (tokens.length < 4) {
          throw new Error(`Gen code must have at least 4 tokens, got: "${genCode}"`);
        }
        const defIndex = parseInt(tokens[0], 10);
        const paintIndex = parseInt(tokens[1], 10);
        const paintSeed = parseInt(tokens[2], 10);
        const paintWear = parseFloat(tokens[3]);
        let rest = tokens.slice(4);
        const stickers = [];
        const keychains = [];
        if (rest.length >= 10) {
          const stickerTokens = rest.slice(0, 10);
          for (let slot = 0; slot < 5; slot++) {
            const sid = parseInt(stickerTokens[slot * 2], 10);
            const wear = parseFloat(stickerTokens[slot * 2 + 1]);
            if (sid !== 0) {
              stickers.push(new Sticker({ slot, stickerId: sid, wear }));
            }
          }
          rest = rest.slice(10);
        }
        for (let i = 0; i + 1 < rest.length; i += 2) {
          const sid = parseInt(rest[i], 10);
          const wear = parseFloat(rest[i + 1]);
          if (sid !== 0) {
            keychains.push(new Sticker({ slot: i / 2, stickerId: sid, wear }));
          }
        }
        return new ItemPreviewData({ defIndex, paintIndex, paintSeed, paintWear, stickers, keychains });
      }
      function genCodeFromLink(hexOrUrl, prefix = "!gen") {
        const item = InspectLink.deserialize(hexOrUrl);
        return toGenCode(item, prefix);
      }
      module.exports = { toGenCode, generate, parseGenCode, genCodeFromLink, INSPECT_BASE };
    }
  });

  // node_modules/@vlydev/cs2-masked-inspect/index.js
  var require_cs2_masked_inspect = __commonJS({
    "node_modules/@vlydev/cs2-masked-inspect/index.js"(exports, module) {
      "use strict";
      init_craft_inspect_buffer_shim();
      var InspectLink = require_InspectLink();
      var ItemPreviewData = require_ItemPreviewData();
      var Sticker = require_Sticker();
      var MalformedInspectLinkError = require_MalformedInspectLinkError();
      var { toGenCode, generate, parseGenCode, genCodeFromLink, INSPECT_BASE } = require_GenCode();
      module.exports = { InspectLink, ItemPreviewData, Sticker, MalformedInspectLinkError, toGenCode, generate, parseGenCode, genCodeFromLink, INSPECT_BASE };
    }
  });

  // react/craft-inspect.js
  var require_craft_inspect = __commonJS({
    "react/craft-inspect.js"(exports, module) {
      init_craft_inspect_buffer_shim();
      var { InspectLink, Sticker, generate } = require_cs2_masked_inspect();
      var MAX_INSPECT_URL_LENGTH = 1800;
      function roundInspectNumber(value, digits = 4) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return null;
        const factor = 10 ** digits;
        return Math.round(parsed * factor) / factor;
      }
      function hasMeaningfulInspectOffsets(inspect) {
        if (!inspect || typeof inspect !== "object") return false;
        if (inspect.nearDefault) return false;
        const offsetX = Number(inspect.offsetX);
        const offsetY = Number(inspect.offsetY);
        const offsetZ = Number(inspect.offsetZ);
        const rotation = Number(inspect.rotation);
        const scale = Number(inspect.scale);
        const hasOffset = [offsetX, offsetY, offsetZ].some(
          (value) => Number.isFinite(value) && Math.abs(value) > 2e-3
        );
        const hasRotation = Number.isFinite(rotation) && Math.abs(rotation) > 0.5;
        const hasScale = Number.isFinite(scale) && Math.abs(scale - 1) > 0.02;
        return hasOffset || hasRotation || hasScale;
      }
      function hasCustomStickerInspect(sticker) {
        if (!sticker) return false;
        const inspect = sticker.inspect || sticker.placement?.inspect || null;
        return hasMeaningfulInspectOffsets(inspect);
      }
      function normalizeStickerWear(wear) {
        const parsed = Number(wear);
        if (!Number.isFinite(parsed) || parsed <= 0) return null;
        return Math.max(0, Math.min(1, parsed));
      }
      function applyStickerInspectOffsets(custom, inspect) {
        if (!inspect || typeof inspect !== "object") return;
        const offsetX = roundInspectNumber(inspect.offsetX);
        const offsetY = roundInspectNumber(inspect.offsetY);
        if (Number.isFinite(offsetX) && Math.abs(offsetX) > 2e-3) custom.offsetX = offsetX;
        if (Number.isFinite(offsetY) && Math.abs(offsetY) > 2e-3) custom.offsetY = offsetY;
      }
      function applyKeychainInspectOffsets(payload, entry) {
        const inspect = entry?.inspect || entry?.placement?.inspect || null;
        const sources = [entry, inspect];
        for (const source of sources) {
          if (!source || typeof source !== "object") continue;
          const offsetX = roundInspectNumber(source.offsetX);
          const offsetY = roundInspectNumber(source.offsetY);
          const offsetZ = roundInspectNumber(source.offsetZ);
          if (Number.isFinite(offsetX) && payload.offsetX == null) payload.offsetX = offsetX;
          if (Number.isFinite(offsetY) && payload.offsetY == null) payload.offsetY = offsetY;
          if (Number.isFinite(offsetZ) && payload.offsetZ == null) payload.offsetZ = offsetZ;
        }
      }
      function buildCraftSticker(sticker, slotIndex, { includeOffsets = true } = {}) {
        const slot = Number.isInteger(sticker?.slot) ? sticker.slot : slotIndex;
        const stickerId = Number(sticker?.stickerId) || 0;
        const inspect = sticker?.inspect || sticker?.placement?.inspect || null;
        const rotation = roundInspectNumber(inspect?.rotation ?? sticker?.rotation);
        const hasRotation = Number.isFinite(rotation) && Math.abs(rotation) > 0.5;
        const base = {
          slot,
          stickerId,
          // Omit wear=0 so CS2 treats the sticker as fresh (library examples leave wear null).
          wear: normalizeStickerWear(sticker?.wear)
        };
        if (!stickerId || !includeOffsets || !hasCustomStickerInspect(sticker) && !hasRotation) {
          return new Sticker(base);
        }
        const custom = {
          ...base,
          wear: normalizeStickerWear(inspect?.wear) ?? base.wear
        };
        const scale = roundInspectNumber(inspect?.scale);
        if (Number.isFinite(scale) && Math.abs(scale - 1) > 0.02) custom.scale = scale;
        if (hasRotation) custom.rotation = rotation;
        if (inspect) applyStickerInspectOffsets(custom, inspect);
        return new Sticker(custom);
      }
      function buildCraftKeychain(entry, { includeOffsets = true } = {}) {
        const id = Number(entry?.stickerId || entry?.def_index) || 0;
        if (id <= 0) return null;
        const payload = {
          slot: Number.isInteger(entry?.slot) ? entry.slot : Number(entry?.slot) || 0,
          stickerId: id,
          // Omit wear=0 — same as stickers; encoded 0 can confuse some clients.
          wear: normalizeStickerWear(entry?.wear)
        };
        const pattern = Number(entry?.pattern);
        if (Number.isFinite(pattern) && pattern > 0) payload.pattern = pattern;
        const highlightReel = Number(entry?.highlightReel ?? entry?.highlight_reel);
        if (Number.isFinite(highlightReel) && highlightReel > 0) payload.highlightReel = highlightReel;
        const paintKit = Number(entry?.paintKit ?? entry?.paint_kit ?? entry?.wrappedSticker ?? entry?.wrapped_sticker);
        if (Number.isFinite(paintKit) && paintKit > 0) payload.paintKit = paintKit;
        if (includeOffsets) applyKeychainInspectOffsets(payload, entry);
        return new Sticker(payload);
      }
      function encodeCraftAttachments(params, { includeOffsets = true } = {}) {
        const rawStickers = Array.isArray(params?.stickers) ? params.stickers : [];
        const stickers = [];
        const slotLimit = Math.min(rawStickers.length, 5);
        for (let slotIndex = 0; slotIndex < slotLimit; slotIndex += 1) {
          const entry = rawStickers[slotIndex];
          if (!entry) continue;
          const slotted = Number.isInteger(entry.slot) ? entry : { ...entry, slot: slotIndex };
          const built = buildCraftSticker(slotted, slotIndex, { includeOffsets });
          if (built.stickerId > 0) stickers.push(built);
        }
        const keychains = (Array.isArray(params?.keychains) ? params.keychains : []).map((entry) => buildCraftKeychain(entry, { includeOffsets })).filter(Boolean);
        return { stickers, keychains };
      }
      function attachmentsMatchExpected(url, expectedStickers, expectedKeychains) {
        try {
          const decoded = InspectLink.deserialize(url);
          if ((decoded.stickers || []).length !== expectedStickers.length) return false;
          if ((decoded.keychains || []).length !== expectedKeychains.length) return false;
          const stickerIds = new Set((decoded.stickers || []).map((entry) => Number(entry.stickerId) || 0));
          for (const sticker of expectedStickers) {
            if (!stickerIds.has(Number(sticker.stickerId) || 0)) return false;
          }
          const keychainIds = new Set((decoded.keychains || []).map((entry) => Number(entry.stickerId) || 0));
          for (const keychain of expectedKeychains) {
            if (!keychainIds.has(Number(keychain.stickerId) || 0)) return false;
          }
          return true;
        } catch (_error) {
          return false;
        }
      }
      function buildCraftInspectUrl(params) {
        const defIndex = Number(params?.defIndex);
        const paintIndex = Number(params?.paintIndex);
        const paintSeed = Number(params?.paintSeed);
        const paintWear = Number(params?.paintWear);
        if (!Number.isFinite(defIndex) || defIndex <= 0) {
          throw new Error("Missing weapon defindex");
        }
        if (!Number.isFinite(paintIndex) || paintIndex <= 0) {
          throw new Error("Missing skin paint index");
        }
        if (!Number.isFinite(paintSeed) || paintSeed < 0) {
          throw new Error("Missing paint seed");
        }
        if (!Number.isFinite(paintWear) || paintWear < 0 || paintWear > 1) {
          throw new Error("Invalid paint wear");
        }
        const qualityRaw = Number(params?.quality);
        const quality = Number.isFinite(qualityRaw) && qualityRaw > 0 ? qualityRaw : 4;
        const rarity = Number(params?.rarity) || 0;
        const buildUrl = (includeOffsets) => {
          const { stickers, keychains } = encodeCraftAttachments(params, { includeOffsets });
          return {
            stickers,
            keychains,
            url: generate(defIndex, paintIndex, paintSeed, paintWear, {
              rarity,
              quality,
              stickers,
              keychains
            })
          };
        };
        let result = buildUrl(true);
        const needsFallback = result.url.length > MAX_INSPECT_URL_LENGTH || !attachmentsMatchExpected(result.url, result.stickers, result.keychains);
        if (needsFallback && (result.stickers.length > 0 || result.keychains.length > 0)) {
          result = buildUrl(false);
        }
        if (!attachmentsMatchExpected(result.url, result.stickers, result.keychains)) {
          throw new Error("Inspect link dropped stickers or charm; try again.");
        }
        return result.url;
      }
      module.exports = {
        buildCraftInspectUrl,
        buildCraftSticker,
        buildCraftKeychain,
        hasCustomStickerInspect,
        hasMeaningfulInspectOffsets
      };
    }
  });
  return require_craft_inspect();
})();
/*! Bundled license information:

ieee754/index.js:
  (*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *)

buffer/index.js:
  (*!
   * The buffer module from node.js, for the browser.
   *
   * @author   Feross Aboukhadijeh <https://feross.org>
   * @license  MIT
   *)
*/
