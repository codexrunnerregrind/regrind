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

// With the keyboard up the app already sizes itself to the space left over, so
// WKWebView's scroll-to-reveal only pans the page and JS undoes it a frame
// late, flickering. Refuse the pan at the scroll view.
static BOOL keyboardShowing = NO;

__attribute__((constructor)) static void refuseKeyboardPan(void) {
	NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
	[center addObserverForName:UIKeyboardWillShowNotification object:nil queue:nil
					usingBlock:^(NSNotification *note) { keyboardShowing = YES; }];
	[center addObserverForName:UIKeyboardWillHideNotification object:nil queue:nil
					usingBlock:^(NSNotification *note) { keyboardShowing = NO; }];

	Class cls = NSClassFromString(@"WKScrollView");
	if (!cls) return;

	SEL plain = @selector(setContentOffset:);
	Method plainMethod = class_getInstanceMethod(cls, plain);
	if (plainMethod) {
		void (*plainOrig)(id, SEL, CGPoint) = (void (*)(id, SEL, CGPoint))method_getImplementation(plainMethod);
		class_replaceMethod(cls, plain, imp_implementationWithBlock(^(id _self, CGPoint offset) {
			if (keyboardShowing && offset.y > 0) offset.y = 0;
			plainOrig(_self, plain, offset);
		}), method_getTypeEncoding(plainMethod));
	}

	SEL animated = @selector(setContentOffset:animated:);
	Method animatedMethod = class_getInstanceMethod(cls, animated);
	if (animatedMethod) {
		void (*animatedOrig)(id, SEL, CGPoint, BOOL) = (void (*)(id, SEL, CGPoint, BOOL))method_getImplementation(animatedMethod);
		class_replaceMethod(cls, animated, imp_implementationWithBlock(^(id _self, CGPoint offset, BOOL anim) {
			if (keyboardShowing && offset.y > 0) offset.y = 0;
			animatedOrig(_self, animated, offset, anim);
		}), method_getTypeEncoding(animatedMethod));
	}
}
