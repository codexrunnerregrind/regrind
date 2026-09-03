fn main() {
	// The iOS video transcoder is Objective-C against AVFoundation, compiled in
	// here rather than added to the Xcode target: this crate links as a dylib
	// and would not resolve a symbol from the app target, which links after it.
	// See `src/video.rs`.
	if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
		println!("cargo:rerun-if-changed=native/VideoTranscode.m");
		cc::Build::new()
			.file("native/VideoTranscode.m")
			.flag("-fobjc-arc")
			.compile("regrind_video");
		println!("cargo:rustc-link-lib=framework=AVFoundation");
		println!("cargo:rustc-link-lib=framework=Foundation");
	}
	tauri_build::build()
}
