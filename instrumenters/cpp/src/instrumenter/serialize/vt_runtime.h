/* vt_runtime.h -- value-tracer runtime.
 *
 * Targets: C89 and up, C++98 and up, hosted or freestanding.
 * Dependencies: <stddef.h> only (required even in freestanding C).
 * No malloc, no stdio, no floating-point unless you print floats.
 *
 * Configuration (define before including):
 *   VT_NO_LONGLONG   compiler has no long long; falls back to long
 *   VT_NO_FLOAT      never emit floating-point code (floats print as <float>)
 *   VT_USE_STDIO     use snprintf for floats (default on when __STDC_HOSTED__)
 *   VT_INLINE        override the inline keyword spelling
 *   VT_MAX_STRLEN    cap for unterminated char* scans (default 256)
 */
#ifndef VT_RUNTIME_H
#define VT_RUNTIME_H

#include <stddef.h>

/* ---------------------------------------------------------------- inline -- */
#ifndef VT_INLINE
#if defined(__cplusplus)
#define VT_INLINE static inline
#elif defined(__STDC_VERSION__) && __STDC_VERSION__ >= 199901L
#define VT_INLINE static inline
#elif defined(__GNUC__)
#define VT_INLINE static __inline__
#elif defined(_MSC_VER)
#define VT_INLINE static __inline
#else
#define VT_INLINE static
#endif
#endif

#ifndef VT_MAX_STRLEN
#define VT_MAX_STRLEN 256
#endif

#if !defined(VT_USE_STDIO) && !defined(VT_NO_FLOAT)
#if defined(__STDC_HOSTED__) && __STDC_HOSTED__ == 1
#if (defined(__STDC_VERSION__) && __STDC_VERSION__ >= 199901L) || \
    (defined(__cplusplus) && __cplusplus >= 201103L)
#define VT_USE_STDIO 1
#endif
#endif
#endif
#if defined(VT_USE_STDIO) && VT_USE_STDIO
#include <stdio.h>
#endif

/* ------------------------------------------------------------- integers --- */
/* `long long` is C99/C++11. Assume it is absent on older dialects unless the
 * compiler advertises it, so that -pedantic C89 builds stay clean. */
#if !defined(VT_NO_LONGLONG) && !defined(VT_HAVE_LONGLONG)
#if (defined(__STDC_VERSION__) && __STDC_VERSION__ >= 199901L) || \
    (defined(__cplusplus) && __cplusplus >= 201103L) ||           \
    defined(_MSC_VER)
#define VT_HAVE_LONGLONG 1
#else
#define VT_NO_LONGLONG 1
#endif
#endif

#if defined(VT_NO_LONGLONG)
typedef long vt_i64;
typedef unsigned long vt_u64;
typedef unsigned long vt_uptr;
#else
typedef long long vt_i64;
typedef unsigned long long vt_u64;
typedef unsigned long long vt_uptr;
#endif

typedef size_t vt_size;
typedef void (*vt_fnptr_t)(void);

#ifdef __cplusplus
extern "C++"
{
#endif

  /* ------------------------------------------------------------------ sink -- */
  /* Writes into a caller-owned buffer. When the buffer fills, `flush` (if set)
   * drains it; otherwise output is truncated and `truncated` is set. `dropped`
   * counts bytes that never made it out. */
  typedef struct vt_sink
  {
    char *buf;
    vt_size cap;
    vt_size len;
    int truncated;
    vt_size dropped;
    void (*flush)(void *ud, const char *p, vt_size n);
    void *ud;
  } vt_sink;

  VT_INLINE void vt_init(vt_sink *s, char *buf, vt_size cap)
  {
    s->buf = buf;
    s->cap = cap;
    s->len = 0;
    s->truncated = 0;
    s->dropped = 0;
    s->flush = 0;
    s->ud = 0;
  }

  VT_INLINE void vt_flush(vt_sink *s)
  {
    if (s->flush && s->len)
    {
      s->flush(s->ud, s->buf, s->len);
      s->len = 0;
    }
  }

  VT_INLINE void vt_putn(vt_sink *s, const char *p, vt_size n)
  {
    vt_size i;
    for (i = 0; i < n; ++i)
    {
      if (s->len + 1 >= s->cap)
      { /* keep 1 byte for the NUL */
        if (s->flush)
        {
          vt_flush(s);
        }
        else
        {
          s->truncated = 1;
          s->dropped += (n - i);
          return;
        }
      }
      s->buf[s->len++] = p[i];
    }
  }

  VT_INLINE void vt_putc(vt_sink *s, char c) { vt_putn(s, &c, 1); }

  VT_INLINE void vt_puts(vt_sink *s, const char *p)
  {
    vt_size n = 0;
    if (!p)
      return;
    while (p[n])
      ++n;
    vt_putn(s, p, n);
  }

  /* NUL-terminate and return the buffer (only meaningful without a flush hook) */
  VT_INLINE const char *vt_done(vt_sink *s)
  {
    if (s->cap)
      s->buf[s->len < s->cap ? s->len : s->cap - 1] = '\0';
    return s->buf;
  }

/* Literal append with compile-time length. */
#define vt_lit(s, L) vt_putn((s), "" L "", (vt_size)(sizeof(L) - 1))

  VT_INLINE void vt_null(vt_sink *s) { vt_lit(s, "null"); }

  /* ---------------------------------------------------------------- escape -- */
  VT_INLINE void vt_esc(vt_sink *s, char c)
  {
    static const char hex[] = "0123456789abcdef";
    unsigned char u = (unsigned char)c;
    switch (c)
    {
    case '"':
      vt_lit(s, "\\\"");
      return;
    case '\\':
      vt_lit(s, "\\\\");
      return;
    case '\n':
      vt_lit(s, "\\n");
      return;
    case '\r':
      vt_lit(s, "\\r");
      return;
    case '\t':
      vt_lit(s, "\\t");
      return;
    default:
      break;
    }
    if (u < 0x20u || u >= 0x7fu)
    {
      vt_lit(s, "\\x");
      vt_putc(s, hex[(u >> 4) & 0xf]);
      vt_putc(s, hex[u & 0xf]);
    }
    else
    {
      vt_putc(s, c);
    }
  }

  /* --------------------------------------------------------------- scalars -- */
  VT_INLINE void vt_bool(vt_sink *s, int v)
  {
    if (v)
      vt_lit(s, "true");
    else
      vt_lit(s, "false");
  }

  VT_INLINE void vt_char(vt_sink *s, char c)
  {
    vt_putc(s, '\'');
    if (c == '\'')
      vt_lit(s, "\\'");
    else if (c == 0)
      vt_lit(s, "\\0");
    else
      vt_esc(s, c);
    vt_putc(s, '\'');
  }

  VT_INLINE void vt_u64f(vt_sink *s, vt_u64 v)
  {
    char tmp[24];
    int i = (int)sizeof(tmp);
    do
    {
      tmp[--i] = (char)('0' + (int)(v % 10));
      v /= 10;
    } while (v);
    vt_putn(s, tmp + i, (vt_size)((int)sizeof(tmp) - i));
  }

  VT_INLINE void vt_i64f(vt_sink *s, vt_i64 v)
  {
    vt_u64 u;
    if (v < 0)
    {
      vt_putc(s, '-');
      u = (vt_u64)(-(v + 1)) + 1u;
    }
    else
    {
      u = (vt_u64)v;
    }
    vt_u64f(s, u);
  }

  VT_INLINE void vt_hex(vt_sink *s, vt_uptr v, int width)
  {
    static const char hex[] = "0123456789abcdef";
    char tmp[24];
    int i = (int)sizeof(tmp);
    do
    {
      tmp[--i] = hex[(int)(v & 0xfu)];
      v >>= 4;
    } while (v);
    while ((int)sizeof(tmp) - i < width)
      tmp[--i] = '0';
    vt_lit(s, "0x");
    vt_putn(s, tmp + i, (vt_size)((int)sizeof(tmp) - i));
  }

  VT_INLINE void vt_ptr(vt_sink *s, const volatile void *p)
  {
    if (!p)
    {
      vt_null(s);
      return;
    }
    vt_hex(s, (vt_uptr)(size_t)p, 0);
  }

  VT_INLINE void vt_fnptr(vt_sink *s, vt_fnptr_t f)
  {
    /* Function and data pointers may differ in size (Harvard machines), so go
     * through a union instead of casting. */
    union
    {
      vt_fnptr_t f;
      vt_uptr u;
      unsigned char raw[sizeof(vt_fnptr_t)];
    } u;
    vt_size i;
    if (!f)
    {
      vt_null(s);
      return;
    }
    for (i = 0; i < sizeof(u); ++i)
      u.raw[i] = 0;
    u.f = f;
    vt_hex(s, u.u, 0);
  }

/* ---------------------------------------------------------------- floats -- */
#if defined(VT_NO_FLOAT)
  VT_INLINE void vt_f64(vt_sink *s, double v)
  {
    (void)v;
    vt_lit(s, "<float>");
  }
#elif defined(VT_USE_STDIO) && VT_USE_STDIO
VT_INLINE void vt_f64(vt_sink *s, double v)
{
  char b[40];
  int n = snprintf(b, sizeof(b), "%.17g", v);
  if (n > 0)
    vt_putn(s, b, (vt_size)(n < (int)sizeof(b) ? n : (int)sizeof(b) - 1));
}
#else
/* Freestanding fallback. ~9 significant digits; exact round-tripping is not
 * attempted. Define VT_USE_STDIO on hosted targets if you need %.17g. */
VT_INLINE void vt_f64(vt_sink *s, double v)
{
  const double HUGE_ = 1.7976931348623157e308;
  int e = 0, i;
  double d;
  if (v != v)
  {
    vt_lit(s, "nan");
    return;
  }
  if (v < 0.0)
  {
    vt_putc(s, '-');
    v = -v;
  }
  if (v > HUGE_)
  {
    vt_lit(s, "inf");
    return;
  }
  if (v == 0.0)
  {
    vt_lit(s, "0");
    return;
  }
  while (v >= 10.0)
  {
    v /= 10.0;
    ++e;
  }
  while (v < 1.0)
  {
    v *= 10.0;
    --e;
  }
  v += 5e-9; /* round at the 9th digit */
  if (v >= 10.0)
  {
    v /= 10.0;
    ++e;
  }
  {
    char dig[9];
    int n = 9;
    for (i = 0; i < 9; ++i)
    {
      int k = (int)v;
      if (k > 9)
        k = 9;
      dig[i] = (char)('0' + k);
      v = (v - (double)k) * 10.0;
    }
    while (n > 1 && dig[n - 1] == '0')
      --n;
    vt_putc(s, dig[0]);
    if (n > 1)
    {
      vt_putc(s, '.');
      vt_putn(s, dig + 1, (vt_size)(n - 1));
    }
  }
  if (e == 0)
    return;
  vt_putc(s, 'e');
  if (e < 0)
  {
    vt_putc(s, '-');
    e = -e;
  }
  else
    vt_putc(s, '+');
  d = (double)e;
  (void)d;
  vt_u64f(s, (vt_u64)e);
}
#endif

  /* --------------------------------------------------------------- strings -- */
  VT_INLINE void vt_cstr(vt_sink *s, const char *p)
  {
    vt_size n = 0;
    if (!p)
    {
      vt_null(s);
      return;
    }
    while (n < (vt_size)VT_MAX_STRLEN && p[n])
      ++n;
    vt_putc(s, '"');
    {
      vt_size i;
      for (i = 0; i < n; ++i)
        vt_esc(s, p[i]);
    }
    vt_putc(s, '"');
    if (n == (vt_size)VT_MAX_STRLEN)
      vt_lit(s, "...");
  }

  VT_INLINE void vt_cstrn(vt_sink *s, const char *p, vt_size cap)
  {
    vt_size n = 0, i;
    if (!p)
    {
      vt_null(s);
      return;
    }
    while (n < cap && p[n])
      ++n;
    vt_putc(s, '"');
    for (i = 0; i < n; ++i)
      vt_esc(s, p[i]);
    vt_putc(s, '"');
  }

#ifdef __cplusplus
} /* extern "C++" */
#endif

/* ------------------------------------------------- optional C++ adapter --- */
#if defined(__cplusplus) && !defined(VT_NO_CXX_STRING)
#include <string>
namespace vt
{
  /* Drop-in replacement for the old std::string-returning printers:
   *     std::string s = vt::capture(Point3D__struct, &p);            */
  inline void append_cb(void *ud, const char *p, vt_size n)
  {
    static_cast<std::string *>(ud)->append(p, n);
  }
  template <class F, class T>
  inline std::string capture(F fn, const T *v, vt_size chunk = 128)
  {
    std::string out;
    char buf[256];
    vt_sink s;
    vt_init(&s, buf, chunk < sizeof(buf) ? chunk : sizeof(buf));
    s.flush = &append_cb;
    s.ud = &out;
    fn(&s, v);
    vt_flush(&s);
    return out;
  }
} /* namespace vt */
#endif

#endif /* VT_RUNTIME_H */
