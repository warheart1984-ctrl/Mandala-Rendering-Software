#version 450

layout(local_size_x = 64) in;

struct Node {
    vec4 low;
    vec4 high;
    int left;
    int right;
    uint first;
    uint count;
};

struct Primitive {
    vec4 v0;
    vec4 v1;
    vec4 v2;
    vec4 v3;
    vec4 v4;
    uint id;
    uint p0;
    uint p1;
    uint p2;
};

struct Hit {
    float enter;
    float exit;
    int id;
    uint flags;
    vec4 eb;
    float e4;
    float p0;
    float p1;
    float p2;
    vec4 xb;
    float x4;
    float p3;
    float p4;
    float p5;
};

layout(std430, binding = 0) readonly buffer Nodes { Node v[]; } nodes;
layout(std430, binding = 1) readonly buffer Primitives { Primitive v[]; } primitives;
layout(std430, binding = 2) readonly buffer Origins { vec4 v[]; } origins;
layout(std430, binding = 3) readonly buffer Directions { vec4 v[]; } directions;
layout(std430, binding = 4) readonly buffer Ranges { vec4 v[]; } ranges;
layout(std430, binding = 5) writeonly buffer Hits { Hit v[]; } hits;

layout(push_constant) uniform Params {
    uint rays;
    uint nodeCount;
    uint primitiveCount;
    uint p;
} params;

const uint HIT = 1u;
const uint DEGENERATE = 2u;
const uint INVALID = 4u;

bool finite4(vec4 x) {
    return !any(isnan(x)) && !any(isinf(x));
}

float d3(vec3 a, vec3 b, vec3 c) {
    return dot(a, cross(b, c));
}

float d4(vec4 a, vec4 b, vec4 c, vec4 d) {
    return a.x * d3(b.yzw, c.yzw, d.yzw) -
           b.x * d3(a.yzw, c.yzw, d.yzw) +
           c.x * d3(a.yzw, b.yzw, d.yzw) -
           d.x * d3(a.yzw, b.yzw, c.yzw);
}

bool box(vec4 o, vec4 d, vec4 lo, vec4 hi, float mn, float mx) {
    if (!finite4(o) || !finite4(d) || !finite4(lo) || !finite4(hi) ||
        any(greaterThan(lo, hi)))
        return false;
    float a = mn;
    float b = mx;
    for (int i = 0; i < 4; ++i) {
        if (abs(d[i]) <= 1e-12) {
            if (o[i] < lo[i] - 1e-6 || o[i] > hi[i] + 1e-6) return false;
        } else {
            float x = (lo[i] - o[i]) / d[i];
            float y = (hi[i] - o[i]) / d[i];
            a = max(a, min(x, y));
            b = min(b, max(x, y));
            if (b < a) return false;
        }
    }
    return true;
}

Hit miss() {
    Hit r;
    r.enter = 1e30;
    r.exit = -1e30;
    r.id = -1;
    r.flags = 0u;
    r.eb = vec4(0);
    r.e4 = 0;
    r.p0 = r.p1 = r.p2 = 0;
    r.xb = vec4(0);
    r.x4 = 0;
    r.p3 = r.p4 = r.p5 = 0;
    return r;
}

Hit direct(Primitive q, vec4 o, vec4 dir, vec4 range) {
    Hit r = miss();
    if (!finite4(q.v0) || !finite4(q.v1) || !finite4(q.v2) || !finite4(q.v3) ||
        !finite4(q.v4) || !finite4(o) || !finite4(dir) || !finite4(range) ||
        range.x > range.y || q.id > 0x7fffffffu) {
        r.flags = INVALID;
        return r;
    }
    vec4 e1 = q.v1 - q.v0;
    vec4 e2 = q.v2 - q.v0;
    vec4 e3 = q.v3 - q.v0;
    vec4 e4 = q.v4 - q.v0;
    float det = d4(e1, e2, e3, e4);
    float s = max(max(max(max(abs(e1.x), abs(e1.y)), max(abs(e1.z), abs(e1.w))),
                      max(max(abs(e2.x), abs(e2.y)), max(abs(e2.z), abs(e2.w)))),
                  max(max(max(abs(e3.x), abs(e3.y)), max(abs(e3.z), abs(e3.w))),
                      max(max(abs(e4.x), abs(e4.y)), max(abs(e4.z), abs(e4.w)))));
    float ss = max(s, 1e-6);
    if (abs(det) <= 1e-7 * ss * ss * ss * ss) {
        r.id = int(q.id);
        r.flags = DEGENERATE;
        return r;
    }
    vec4 rhs = o - q.v0;
    float a1 = d4(rhs, e2, e3, e4) / det;
    float a2 = d4(e1, rhs, e3, e4) / det;
    float a3 = d4(e1, e2, rhs, e4) / det;
    float a4 = d4(e1, e2, e3, rhs) / det;
    vec4 a = vec4(1.0 - a1 - a2 - a3 - a4, a1, a2, a3);
    rhs = dir;
    vec4 b;
    float b4;
    b.x = 1.0 - d4(rhs, e2, e3, e4) / det - d4(e1, rhs, e3, e4) / det -
          d4(e1, e2, rhs, e4) / det - d4(e1, e2, e3, rhs) / det - 1.0;
    b.y = d4(rhs, e2, e3, e4) / det;
    b.z = d4(e1, rhs, e3, e4) / det;
    b.w = d4(e1, e2, rhs, e4) / det;
    b4 = d4(e1, e2, e3, rhs) / det;
    float enter = range.x;
    float exit = range.y;
    float aa[5] = float[5](a.x, a.y, a.z, a.w, a4);
    float bb[5] = float[5](b.x, b.y, b.z, b.w, b4);
    for (int i = 0; i < 5; ++i) {
        if (abs(bb[i]) <= 1e-12) {
            if (aa[i] < -1e-6) return miss();
        } else {
            float t = (-1e-6 - aa[i]) / bb[i];
            if (bb[i] > 0.0)
                enter = max(enter, t);
            else
                exit = min(exit, t);
            if (exit < enter) return miss();
        }
    }
    r.enter = enter;
    r.exit = exit;
    r.id = int(q.id);
    r.flags = HIT;
    r.eb = a + b * enter;
    r.e4 = a4 + b4 * enter;
    r.xb = a + b * exit;
    r.x4 = a4 + b4 * exit;
    return r;
}

void main() {
    uint x = gl_GlobalInvocationID.x;
    if (x >= params.rays) return;
    Hit r = miss();
    if (params.nodeCount == 0 || params.primitiveCount == 0) {
        r.flags = INVALID;
        hits.v[x] = r;
        return;
    }
    int stack[64];
    int n = 1;
    stack[0] = 0;
    uint seen = 0;
    float closest = ranges.v[x].y;
    while (n > 0) {
        if (seen++ >= params.nodeCount) {
            r.flags |= INVALID;
            break;
        }
        int ni = stack[--n];
        if (ni < 0 || uint(ni) >= params.nodeCount) {
            r.flags |= INVALID;
            continue;
        }
        Node node = nodes.v[ni];
        if (!box(origins.v[x], directions.v[x], node.low, node.high,
                 ranges.v[x].x, closest))
            continue;
        if (node.count > 0) {
            if (node.first > params.primitiveCount ||
                node.count > params.primitiveCount - node.first) {
                r.flags |= INVALID;
                continue;
            }
            for (uint i = 0; i < node.count; ++i) {
                Hit c = direct(primitives.v[node.first + i], origins.v[x],
                               directions.v[x],
                               vec4(ranges.v[x].x, closest, 0, 0));
                if ((c.flags & HIT) == 0u) continue;
                bool near = c.enter < closest - 2e-5 * max(1.0, max(abs(c.enter), abs(closest)));
                bool tie = abs(c.enter - closest) <=
                               2e-5 * max(1.0, max(abs(c.enter), abs(closest))) &&
                           (r.id < 0 || c.id < r.id);
                if (near || tie) {
                    closest = min(closest, c.enter);
                    r = c;
                }
            }
        } else {
            if (node.left < 0 || node.right < 0 || n > 62) {
                r.flags |= INVALID;
                continue;
            }
            stack[n++] = node.left;
            stack[n++] = node.right;
        }
    }
    hits.v[x] = r;
}
