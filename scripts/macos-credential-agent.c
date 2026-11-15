#include <Security/Security.h>
#include <CoreFoundation/CoreFoundation.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#ifndef PARENT_REQUIREMENT
#error A pinned parent code requirement is required
#endif
#ifndef CREDENTIAL_SERVICE
#define CREDENTIAL_SERVICE "io.jojoshine.tasksprite.sync.v2"
#endif
static int approved_parent(void) {
 pid_t pid=getppid();CFNumberRef number=CFNumberCreate(NULL,kCFNumberIntType,&pid);
 const void *keys[]={kSecGuestAttributePid};const void *values[]={number};
 CFDictionaryRef attributes=CFDictionaryCreate(NULL,keys,values,1,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);
 SecCodeRef parent=NULL;OSStatus status=SecCodeCopyGuestWithAttributes(NULL,attributes,0,&parent);
 CFRelease(attributes);CFRelease(number);if(status)return 0;
 CFStringRef expression=CFStringCreateWithCString(NULL,PARENT_REQUIREMENT,kCFStringEncodingUTF8);
 SecRequirementRef requirement=NULL;status=SecRequirementCreateWithString(expression,0,&requirement);CFRelease(expression);
 if(!status){status=SecCodeCheckValidity(parent,kSecCSStrictValidate,requirement);CFRelease(requirement);}
 CFRelease(parent);return status==0;
}
int main(int argc,char **argv) {
 if(argc!=2||!approved_parent()){fputs("CALLER_NOT_AUTHORIZED\n",stderr);return 77;}
 int reading=strcmp(argv[1],"read")==0,writing=strcmp(argv[1],"write")==0,clearing=strcmp(argv[1],"clear")==0;
 if(!reading&&!writing&&!clearing)return 2;
 unsigned char input[16385];size_t size=0;
 if(writing){size=fread(input,1,sizeof(input),stdin);if(ferror(stdin)||!size||size>16384)return 2;}
 Boolean previous;OSStatus status=SecKeychainGetUserInteractionAllowed(&previous);if(status)return 3;
 status=SecKeychainSetUserInteractionAllowed(false);if(status)return 3;
 const char *service=CREDENTIAL_SERVICE,*account="device";UInt32 length=0;void *data=NULL;SecKeychainItemRef item=NULL;
 status=SecKeychainFindGenericPassword(NULL,strlen(service),service,strlen(account),account,&length,&data,&item);
 if(status==errSecItemNotFound){
  if(writing)status=SecKeychainAddGenericPassword(NULL,strlen(service),service,strlen(account),account,size,input,NULL);
  else status=0;
 }else if(!status){
  if(writing)status=SecKeychainItemModifyAttributesAndData(item,NULL,size,input);
  else if(clearing)status=SecKeychainItemDelete(item);
  else if(reading&&length>16384)status=errSecParam;
  else if(reading&&length&&fwrite(data,1,length,stdout)!=length)status=errSecIO;
 }
 if(data)SecKeychainItemFreeContent(NULL,data);if(item)CFRelease(item);
 OSStatus restored=SecKeychainSetUserInteractionAllowed(previous);if(!status)status=restored;
 memset(input,0,sizeof(input));
 if(status){fprintf(stderr,"KEYCHAIN_STATUS:%d\n",(int)status);return 3;}
 return 0;
}
