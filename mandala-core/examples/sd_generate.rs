use mandala_core::sd_bridge::{SdTurboGgufRuntime, SdTurboConfig, validate_generation};

fn main() {
    let config = SdTurboConfig {
        model_path: r"E:\models\sd_turbo.gguf".to_string(),
        n_ctx: 4096,
        n_batch: 512,
    };

    let mut runtime = SdTurboGgufRuntime::new(config);
    match runtime.load() {
        Ok(_) => println!("GGUF loaded"),
        Err(e) => {
            eprintln!("Load failed: {}", e);
            return;
        }
    }

    let prompt = "constitutional rendering test: low noise, replayable output";
    let bundle = runtime.generate_evidence(prompt).expect("evidence generation failed");
    println!("assist_only: {}", bundle.assist_only);

    match validate_generation(&bundle) {
        Ok(image) => println!("Constitutional image validated, replay_token={}", image.replay_token),
        Err(e) => eprintln!("Validation failed: {}", e),
    }
}
