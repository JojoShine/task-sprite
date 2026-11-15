#import <Foundation/Foundation.h>
#import <Security/Security.h>
typedef struct __SecCodeSigner *SecCodeSignerRef;
extern const CFStringRef kSecCodeSignerIdentity;
extern const CFStringRef kSecCodeSignerIdentifier;
extern const CFStringRef kSecCodeSignerFlags;
extern OSStatus SecCodeSignerCreate(CFDictionaryRef, SecCSFlags, SecCodeSignerRef *);
extern OSStatus SecCodeSignerAddSignature(SecCodeSignerRef, SecStaticCodeRef, SecCSFlags);
static void check(OSStatus status, const char *step) { if (status) { fprintf(stderr,"%s failed (%d)\n",step,(int)status); exit(1); } }
int main(int argc, const char **argv) { @autoreleasepool {
 if(argc!=5) return 2;
 NSData *p12=[NSData dataWithContentsOfFile:@(argv[1])];
 NSString *password=[NSString stringWithContentsOfFile:@(argv[2]) encoding:NSUTF8StringEncoding error:nil];
 if(!p12||!password) return 2;
 NSDictionary *options=@{(__bridge NSString*)kSecImportExportPassphrase:password,(__bridge NSString*)kSecImportToMemoryOnly:@YES};
 CFArrayRef items=NULL;check(SecPKCS12Import((__bridge CFDataRef)p12,(__bridge CFDictionaryRef)options,&items),"import in-memory identity");
 CFDictionaryRef first=(CFDictionaryRef)CFArrayGetValueAtIndex(items,0);
 SecIdentityRef identity=(SecIdentityRef)CFDictionaryGetValue(first,kSecImportItemIdentity);
 NSDictionary *parameters=@{(__bridge NSString*)kSecCodeSignerIdentity:(__bridge id)identity,(__bridge NSString*)kSecCodeSignerIdentifier:@(argv[4]),(__bridge NSString*)kSecCodeSignerFlags:@(0x10000)};
 SecCodeSignerRef signer=NULL;check(SecCodeSignerCreate((__bridge CFDictionaryRef)parameters,0,&signer),"create signer");
 NSURL *url=[NSURL fileURLWithPath:@(argv[3])];SecStaticCodeRef code=NULL;
 check(SecStaticCodeCreateWithPath((__bridge CFURLRef)url,0,&code),"open code");
 check(SecCodeSignerAddSignature(signer,code,0),"sign code");
 CFRelease(code);CFRelease(signer);CFRelease(items);return 0;
} }
