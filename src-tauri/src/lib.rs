// The embedded MeshNode builder/start future nests deeply enough to blow the
// default query depth when computing async fn layouts.
#![recursion_limit = "256"]

pub mod diagnose;
pub mod events;
pub mod node;
pub mod proxy;
pub mod server;
pub mod state;
