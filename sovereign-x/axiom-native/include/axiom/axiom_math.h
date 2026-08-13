/**
 * Axiom Math - 4D Vector Types
 * Deterministic, bitwise-identical across platforms
 */

#ifndef AXIOM_MATH_H
#define AXIOM_MATH_H

#include <stdint.h>
#include <math.h>

#ifdef __cplusplus
extern "C" {
#endif

// 4D vector - 16-byte aligned
typedef struct {
    float x, y, z, w;
} axiom_vec4_t;

// 4x4 matrix - column major
typedef struct {
    float m[16];
} axiom_mat4_t;

// Vec4 operations (inline for performance)
static inline axiom_vec4_t axiom_vec4(float x, float y, float z, float w) {
    axiom_vec4_t v = {x, y, z, w};
    return v;
}

static inline axiom_vec4_t axiom_vec4_add(axiom_vec4_t a, axiom_vec4_t b) {
    return axiom_vec4(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w);
}

static inline axiom_vec4_t axiom_vec4_sub(axiom_vec4_t a, axiom_vec4_t b) {
    return axiom_vec4(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w);
}

static inline axiom_vec4_t axiom_vec4_mul(axiom_vec4_t a, axiom_vec4_t b) {
    return axiom_vec4(a.x * b.x, a.y * b.y, a.z * b.z, a.w * b.w);
}

static inline axiom_vec4_t axiom_vec4_scale(axiom_vec4_t a, float s) {
    return axiom_vec4(a.x * s, a.y * s, a.z * s, a.w * s);
}

static inline float axiom_vec4_dot(axiom_vec4_t a, axiom_vec4_t b) {
    return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

static inline float axiom_vec4_length2(axiom_vec4_t v) {
    return axiom_vec4_dot(v, v);
}

static inline float axiom_vec4_length(axiom_vec4_t v) {
    return sqrtf(axiom_vec4_length2(v));
}

static inline axiom_vec4_t axiom_vec4_normalize(axiom_vec4_t v) {
    float len = axiom_vec4_length(v);
    if (len == 0.0f) return v;
    return axiom_vec4_scale(v, 1.0f / len);
}

// 4D cross product (wedge product for plane construction)
static inline axiom_vec4_t axiom_vec4_cross4(axiom_vec4_t a, axiom_vec4_t b, axiom_vec4_t c) {
    // 4D cross product of three vectors
    float ax = a.x, ay = a.y, az = a.z, aw = a.w;
    float bx = b.x, by = b.y, bz = b.z, bw = b.w;
    float cx = c.x, cy = c.y, cz = c.z, cw = c.w;
    
    axiom_vec4_t r;
    r.x =  ay * (bz * cw - bw * cz) - az * (by * cw - bw * cy) + aw * (by * cz - bz * cy);
    r.y = -ax * (bz * cw - bw * cz) + az * (bx * cw - bw * cx) - aw * (bx * cz - bz * cx);
    r.z =  ax * (by * cw - bw * cy) - ay * (bx * cw - bw * cx) + aw * (bx * cy - by * cx);
    r.w = -ax * (by * cz - bz * cy) + ay * (bx * cz - bz * cx) - az * (bx * cy - by * cx);
    return r;
}

// Matrix operations
static inline void axiom_mat4_identity(axiom_mat4_t* m) {
    for (int i = 0; i < 16; ++i) m->m[i] = 0.0f;
    m->m[0] = m->m[5] = m->m[10] = m->m[15] = 1.0f;
}

static inline axiom_vec4_t axiom_mat4_mul_vec4(const axiom_mat4_t* m, axiom_vec4_t v) {
    axiom_vec4_t r;
    r.x = m->m[0] * v.x + m->m[4] * v.y + m->m[8] * v.z + m->m[12] * v.w;
    r.y = m->m[1] * v.x + m->m[5] * v.y + m->m[9] * v.z + m->m[13] * v.w;
    r.z = m->m[2] * v.x + m->m[6] * v.y + m->m[10] * v.z + m->m[14] * v.w;
    r.w = m->m[3] * v.x + m->m[7] * v.y + m->m[11] * v.z + m->m[15] * v.w;
    return r;
}

// Deterministic PRNG (mulberry32) - must match Node exactly
static inline uint32_t axiom_mulberry32_next(uint32_t* state) {
    *state = *state + 0x6D2B79F5;
    uint32_t z = *state;
    z = (z ^ (z >> 15)) * 0x1 | z;
    z = (z ^ (z >> 7)) * 0x61 | z;
    return z ^ (z >> 14);
}

static inline float axiom_rng_float(uint32_t* state) {
    return axiom_mulberry32_next(state) / 4294967296.0f;
}

// Deterministic hash for seeds
static inline uint32_t axiom_hash32(uint32_t x) {
    x ^= x >> 16;
    x *= 0x7feb352d;
    x ^= x >> 15;
    x *= 0x846ca68b;
    x ^= x >> 16;
    return x;
}

#ifdef __cplusplus
}
#endif

// C++ class with operator overloads
#ifdef __cplusplus
namespace axiom {

struct Vec4 {
    float x, y, z, w;
    constexpr Vec4() : x(0), y(0), z(0), w(0) {}
    constexpr Vec4(float x_, float y_, float z_, float w_) : x(x_), y(y_), z(z_), w(w_) {}
};

// Vec4 operations
inline Vec4 operator+(const Vec4& a, const Vec4& b) {
    return Vec4{a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w};
}
inline Vec4 operator-(const Vec4& a, const Vec4& b) {
    return Vec4{a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w};
}
inline Vec4 operator*(const Vec4& a, const Vec4& b) {
    return Vec4{a.x * b.x, a.y * b.y, a.z * b.z, a.w * b.w};
}
inline Vec4 operator*(const Vec4& a, float s) {
    return Vec4{a.x * s, a.y * s, a.z * s, a.w * s};
}
inline Vec4 operator*(float s, const Vec4& a) {
    return a * s;
}
inline float dot(const Vec4& a, const Vec4& b) {
    return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}
inline float length2(const Vec4& v) {
    return dot(v, v);
}
inline float length(const Vec4& v) {
    return sqrtf(length2(v));
}
inline Vec4 normalize(const Vec4& v) {
    float len = length(v);
    return len > 0 ? v * (1.0f / len) : v;
}
inline Vec4 cross4(const Vec4& a, const Vec4& b, const Vec4& c) {
    Vec4 r;
    r.x =  a.y * (b.z * c.w - b.w * c.z) - a.z * (b.y * c.w - b.w * c.y) + a.w * (b.y * c.z - b.z * c.y);
    r.y = -a.x * (b.z * c.w - b.w * c.z) + a.z * (b.x * c.w - b.w * c.x) - a.w * (b.x * c.z - b.z * c.x);
    r.z =  a.x * (b.y * c.w - b.w * c.y) - a.y * (b.x * c.w - b.w * c.x) + a.w * (b.x * c.y - b.y * c.x);
    r.w = -a.x * (b.y * c.z - b.z * c.y) + a.y * (b.x * c.z - b.z * c.x) - a.z * (b.x * c.y - b.y * c.x);
    return r;
}

// Mulberry32 PRNG
inline uint32_t mulberry32_next(uint32_t& state) {
    state = state + 0x6D2B79F5;
    uint32_t z = state;
    z = (z ^ (z >> 15)) * 0x1 | z;
    z = (z ^ (z >> 7)) * 0x61 | z;
    return z ^ (z >> 14);
}
inline float rng_float(uint32_t& state) {
    return mulberry32_next(state) / 4294967296.0f;
}
inline uint32_t hash32(uint32_t x) {
    x ^= x >> 16;
    x *= 0x7feb352d;
    x ^= x >> 15;
    x *= 0x846ca68b;
    x ^= x >> 16;
    return x;
}

} // namespace axiom
#endif

#endif // AXIOM_MATH_H