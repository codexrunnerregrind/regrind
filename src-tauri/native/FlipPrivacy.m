#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

// Main-thread only. A fresh face-down transition emits one event; returning
// upright only rearms it. Unknown orientations and backgrounding never toggle.
static id orientationObserver;
static id backgroundObserver;
static id foregroundObserver;
static __weak WKWebView *privacyWebview;
static BOOL armed;
static NSUInteger generation;

void regrind_set_flip_privacy(void *view, BOOL enabled) {
    NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
    generation++;
    if (orientationObserver) {
        [center removeObserver:orientationObserver];
        [center removeObserver:backgroundObserver];
        [center removeObserver:foregroundObserver];
        orientationObserver = nil;
        backgroundObserver = nil;
        foregroundObserver = nil;
        [UIDevice.currentDevice endGeneratingDeviceOrientationNotifications];
    }
    privacyWebview = nil;
    armed = NO;
    if (!enabled) return;
    privacyWebview = (__bridge WKWebView *)view;
    [UIDevice.currentDevice beginGeneratingDeviceOrientationNotifications];
    UIDeviceOrientation initial = UIDevice.currentDevice.orientation;
    armed = initial != UIDeviceOrientationUnknown && initial != UIDeviceOrientationFaceDown;
    foregroundObserver = [center addObserverForName:UIApplicationDidBecomeActiveNotification
        object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note) {
            generation++;
            UIDeviceOrientation current = UIDevice.currentDevice.orientation;
            armed = current != UIDeviceOrientationUnknown && current != UIDeviceOrientationFaceDown;
        }];
    backgroundObserver = [center addObserverForName:UIApplicationWillResignActiveNotification
        object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note) {
            armed = NO;
            generation++;
        }];
    orientationObserver = [center addObserverForName:UIDeviceOrientationDidChangeNotification
        object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note) {
            UIDeviceOrientation orientation = UIDevice.currentDevice.orientation;
            if (UIApplication.sharedApplication.applicationState != UIApplicationStateActive) return;
            if (orientation == UIDeviceOrientationUnknown) return;
            generation++;
            if (orientation != UIDeviceOrientationFaceDown) {
                armed = YES;
                return;
            }
            if (!armed) return;
            armed = NO;
            NSUInteger expected = generation;
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 300 * NSEC_PER_MSEC),
                dispatch_get_main_queue(), ^{
                    if (generation != expected ||
                        UIDevice.currentDevice.orientation != UIDeviceOrientationFaceDown ||
                        UIApplication.sharedApplication.applicationState != UIApplicationStateActive) return;
                    [privacyWebview evaluateJavaScript:
                        @"if(document.visibilityState==='visible')window.dispatchEvent(new Event('regrind-flip-privacy'))"
                        completionHandler:nil];
                });
        }];
}
