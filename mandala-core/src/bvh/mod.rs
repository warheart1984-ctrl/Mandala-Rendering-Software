/// Bounding Volume Hierarchy (BVH) for 3D scenes
/// Constitutional: deterministic build, byte-identical traversal

#[derive(Debug, Clone)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3 {
    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    pub fn min(&self, other: &Vec3) -> Vec3 {
        Vec3 {
            x: self.x.min(other.x),
            y: self.y.min(other.y),
            z: self.z.min(other.z),
        }
    }

    pub fn max(&self, other: &Vec3) -> Vec3 {
        Vec3 {
            x: self.x.max(other.x),
            y: self.y.max(other.y),
            z: self.z.max(other.z),
        }
    }

    pub fn sub(&self, other: &Vec3) -> Vec3 {
        Vec3 {
            x: self.x - other.x,
            y: self.y - other.y,
            z: self.z - other.z,
        }
    }

    pub fn add(&self, other: &Vec3) -> Vec3 {
        Vec3 {
            x: self.x + other.x,
            y: self.y + other.y,
            z: self.z + other.z,
        }
    }

    pub fn scale(&self, s: f64) -> Vec3 {
        Vec3 {
            x: self.x * s,
            y: self.y * s,
            z: self.z * s,
        }
    }

    pub fn dot(&self, other: &Vec3) -> f64 {
        self.x * other.x + self.y * other.y + self.z * other.z
    }

    pub fn length(&self) -> f64 {
        self.dot(self).sqrt()
    }

    pub fn normalize(&self) -> Vec3 {
        let len = self.length();
        if len < 1e-10 {
            Vec3::new(0.0, 0.0, 0.0)
        } else {
            self.scale(1.0 / len)
        }
    }
}

#[derive(Debug, Clone)]
pub struct AABB {
    pub min: Vec3,
    pub max: Vec3,
}

impl AABB {
    pub fn new(min: Vec3, max: Vec3) -> Self {
        Self { min, max }
    }

    pub fn empty() -> Self {
        Self {
            min: Vec3::new(f64::INFINITY, f64::INFINITY, f64::INFINITY),
            max: Vec3::new(f64::NEG_INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY),
        }
    }

    pub fn expand(&mut self, point: &Vec3) {
        self.min = self.min.min(point);
        self.max = self.max.max(point);
    }

    pub fn expand_aabb(&mut self, other: &AABB) {
        self.expand(&other.min);
        self.expand(&other.max);
    }

    pub fn center(&self) -> Vec3 {
        Vec3 {
            x: (self.min.x + self.max.x) * 0.5,
            y: (self.min.y + self.max.y) * 0.5,
            z: (self.min.z + self.max.z) * 0.5,
        }
    }

    pub fn extent(&self) -> Vec3 {
        Vec3 {
            x: self.max.x - self.min.x,
            y: self.max.y - self.min.y,
            z: self.max.z - self.min.z,
        }
    }

    pub fn surface_area(&self) -> f64 {
        let e = self.extent();
        2.0 * (e.x * e.y + e.y * e.z + e.z * e.x)
    }

    pub fn intersect(&self, ray: &Ray) -> Option<(f64, f64)> {
        let mut tmin = f64::NEG_INFINITY;
        let mut tmax = f64::INFINITY;

        for i in 0..3 {
            let inv_d = 1.0 / ray.direction[i];
            let t0 = (self.min[i] - ray.origin[i]) * inv_d;
            let t1 = (self.max[i] - ray.origin[i]) * inv_d;

            let (t0, t1) = if inv_d < 0.0 { (t1, t0) } else { (t0, t1) };

            tmin = tmin.max(t0);
            tmax = tmax.min(t1);

            if tmax < tmin {
                return None;
            }
        }

        if tmax < 0.0 {
            return None;
        }

        Some((tmin.max(0.0), tmax))
    }
}

impl std::ops::Index<usize> for AABB {
    type Output = f64;

    fn index(&self, index: usize) -> &f64 {
        match index {
            0 => &self.min.x,
            1 => &self.min.y,
            2 => &self.min.z,
            _ => panic!("Index out of bounds"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Ray {
    pub origin: Vec3,
    pub direction: Vec3,
    pub max_distance: f64,
}

impl Ray {
    pub fn new(origin: Vec3, direction: Vec3, max_distance: f64) -> Self {
        Self {
            origin,
            direction: direction.normalize(),
            max_distance,
        }
    }
}

pub struct BVHNode {
    pub aabb: AABB,
    pub left: Option<Box<BVHNode>>,
    pub right: Option<Box<BVHNode>>,
    pub primitive_indices: Vec<usize>,
    pub is_leaf: bool,
}

pub struct BVHBuilder {
    primitives: Vec<AABB>,
    max_leaf_size: usize,
}

impl BVHBuilder {
    pub fn new(primitives: Vec<AABB>, max_leaf_size: usize) -> Self {
        Self {
            primitives,
            max_leaf_size,
        }
    }

    pub fn build(&self) -> Box<BVHNode> {
        let indices: Vec<usize> = (0..self.primitives.len()).collect();
        self.build_recursive(&indices)
    }

    fn build_recursive(&self, indices: &[usize]) -> Box<BVHNode> {
        let mut node = BVHNode {
            aabb: AABB::empty(),
            left: None,
            right: None,
            primitive_indices: indices.to_vec(),
            is_leaf: false,
        };

        // Compute AABB for all primitives
        for &idx in indices {
            node.aabb.expand_aabb(&self.primitives[idx]);
        }

        // Leaf node
        if indices.len() <= self.max_leaf_size {
            node.is_leaf = true;
            return Box::new(node);
        }

        // Find longest axis
        let extent = node.aabb.extent();
        let axis = if extent.y > extent.x {
            if extent.z > extent.y { 2 } else { 1 }
        } else {
            if extent.z > extent.x { 2 } else { 0 }
        };

        // Sort primitives along axis
        let mut sorted_indices = indices.to_vec();
        sorted_indices.sort_by(|&a, &b| {
            let ca = self.primitives[a].center()[axis];
            let cb = self.primitives[b].center()[axis];
            ca.partial_cmp(&cb).unwrap()
        });

        // Split at median
        let mid = sorted_indices.len() / 2;
        let left_indices = sorted_indices[..mid].to_vec();
        let right_indices = sorted_indices[mid..].to_vec();

        node.left = Some(self.build_recursive(&left_indices));
        node.right = Some(self.build_recursive(&right_indices));

        Box::new(node)
    }
}

impl std::ops::Index<usize> for Vec3 {
    type Output = f64;

    fn index(&self, index: usize) -> &f64 {
        match index {
            0 => &self.x,
            1 => &self.y,
            2 => &self.z,
            _ => panic!("Index out of bounds"),
        }
    }
}

pub struct BVHTraversal {
    root: Box<BVHNode>,
}

impl BVHTraversal {
    pub fn new(root: Box<BVHNode>) -> Self {
        Self { root }
    }

    pub fn intersect(&self, ray: &Ray) -> Option<Intersection> {
        let mut closest: Option<Intersection> = None;
        let mut closest_distance = ray.max_distance;

        let mut stack = vec![&*self.root];

        while let Some(node) = stack.pop() {
            if let Some((tmin, _tmax)) = node.aabb.intersect(ray) {
                if tmin > closest_distance {
                    continue;
                }

                if node.is_leaf {
                    // Test primitives (simplified - in real code would test actual geometry)
                    for &idx in &node.primitive_indices {
                        // Placeholder intersection test
                        let distance = tmin;
                        if distance < closest_distance {
                            closest = Some(Intersection {
                                primitive_index: idx,
                                distance,
                                point: ray.origin.add(&ray.direction.scale(distance)),
                                normal: Vec3::new(0.0, 1.0, 0.0),
                            });
                            closest_distance = distance;
                        }
                    }
                } else {
                    if let Some(ref right) = node.right {
                        stack.push(right);
                    }
                    if let Some(ref left) = node.left {
                        stack.push(left);
                    }
                }
            }
        }

        closest
    }
}

#[derive(Debug, Clone)]
pub struct Intersection {
    pub primitive_index: usize,
    pub distance: f64,
    pub point: Vec3,
    pub normal: Vec3,
}

pub struct BVHStats {
    pub nodes: usize,
    pub leaves: usize,
    pub max_depth: usize,
}

pub fn get_bvh_stats(node: &BVHNode) -> BVHStats {
    let mut stack = vec![(node, 0)];
    let mut nodes = 0;
    let mut leaves = 0;
    let mut max_depth = 0;

    while let Some((current, depth)) = stack.pop() {
        nodes += 1;
        max_depth = max_depth.max(depth);

        if current.is_leaf {
            leaves += 1;
        } else {
            if let Some(ref left) = current.left {
                stack.push((left, depth + 1));
            }
            if let Some(ref right) = current.right {
                stack.push((right, depth + 1));
            }
        }
    }

    BVHStats {
        nodes,
        leaves,
        max_depth,
    }
}
