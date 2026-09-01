// WKWebView installs an "input accessory view" (prev/next/Done bar) above the
// keyboard whenever a form control is focused. Native apps don't show it, so it
// looks out of place in the chat composer. There's no public API to disable it
// and wry owns the WKWebView, so we clear the method on the private content
// view class. The lookup fails safe if Apple ever renames the class.
#import <UIKit/UIKit.h>
#import <objc/runtime.h>

__attribute__((constructor)) static void hideWebViewInputAccessory(void) {
	Class cls = NSClassFromString(@"WKContentView");
	if (!cls) return;
	IMP nilIMP = imp_implementationWithBlock(^(id _self) { return (UIView *)nil; });
	class_replaceMethod(cls, @selector(inputAccessoryView), nilIMP, "@@:");
}
