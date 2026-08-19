use std::collections::HashMap;

pub type NodeId = usize;

#[derive(Debug, Clone)]
pub enum Node {
    Const(f32),
    Input(usize),
    Eml(NodeId, NodeId),
}

#[derive(Debug, Clone)]
pub struct EmlTree {
    pub nodes: Vec<Node>,
    pub root: NodeId,
    pub const_map: HashMap<NodeId, usize>,
}

impl EmlTree {
    pub fn new() -> Self {
        Self { nodes: vec![], root: 0, const_map: HashMap::new() }
    }

    pub fn add_const(&mut self, v: f32) -> NodeId {
        let id = self.nodes.len();
        self.nodes.push(Node::Const(v));
        self.const_map.insert(id, self.nodes.len() - 1);
        id
    }

    pub fn add_input(&mut self, idx: usize) -> NodeId {
        let id = self.nodes.len();
        self.nodes.push(Node::Input(idx));
        id
    }

    pub fn add_eml(&mut self, left: NodeId, right: NodeId) -> NodeId {
        let id = self.nodes.len();
        self.nodes.push(Node::Eml(left, right));
        id
    }

    pub fn eval(&self, inputs: &[f32], params: &[f32]) -> f32 {
        let mut values = vec![0.0; self.nodes.len()];
        let mut param_iter = params.iter().copied();
        for (i, node) in self.nodes.iter().enumerate() {
            values[i] = match node {
                Node::Const(_) => param_iter.next().unwrap_or(0.0),
                Node::Input(idx) => inputs.get(*idx).copied().unwrap_or(0.0),
                Node::Eml(l, r) => {
                    let x = values[*l];
                    let y = values[*r];
                    eml_op(x, y)
                }
            };
        }
        values[self.root]
    }
}

fn eml_op(x: f32, y: f32) -> f32 {
    x.exp() - y.ln()
}

pub fn backprop(tree: &EmlTree, inputs: &[f32], params: &[f32], upstream: f32, grad_params: &mut [f32]) {
    let n = tree.nodes.len();
    let mut vals = vec![0.0; n];
    let mut param_iter = params.iter().copied();
    for (i, node) in tree.nodes.iter().enumerate() {
        vals[i] = match node {
            Node::Const(_) => param_iter.next().unwrap_or(0.0),
            Node::Input(idx) => inputs.get(*idx).copied().unwrap_or(0.0),
            Node::Eml(l, r) => eml_op(vals[*l], vals[*r]),
        };
    }
    let mut grads = vec![0.0; n];
    grads[tree.root] = upstream;
    for i in (0..n).rev() {
        let g = grads[i];
        if g == 0.0 { continue; }
        match &tree.nodes[i] {
            Node::Eml(l, r) => {
                let x = vals[*l];
                let y = vals[*r];
                grads[*l] += g * x.exp();
                grads[*r] += g * (-1.0 / y);
            }
            Node::Const(_) => {
                if let Some(&idx) = tree.const_map.get(&i) {
                    grad_params[idx] += g;
                }
            }
            _ => {}
        }
    }
}
