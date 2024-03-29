CHANGELOG:
  v1.1
    change SEC_ENCRYPTION to use pbkdf2 to generate key instead of md5 (see SEC_ENCRYPTION below for details)
    added SEC_MODEMASK
    added global mode mask to settings mask
    old mode mask behavior now known as the header mode mask
    bump SEC_IMAGETABLE and SEC_CURSOR indexs from 8bit to 16bit
  v1.2
    added missing flags to save() object documentation below (this change also backported to 1.1's spec)
    corrected some things regarding the documentation of the object passed to pack()
      added missing SEC_MODEMASK block (this change also backported to 1.1's spec)
      removed 'count' from SEC_PARTIALFILE block as it was never used (this change also backported to 1.0 and 1.1's spec)
    cleaned up some wording around mode and mode mask (this change also backported to 1.1's spec)
    changed several unsigned integer fields into unsigned VLQ (Variable-Length Quantity), with different chunk sizes
      'size'/'length' type fields in 8bit chunks as values are not expected to exceed 16383 very often (2 chunks)
      'index' type fields in 4bit chunks as values are not expected to exceed 7 very often (1 chunk)
      fixed-sized fields, such as SEC_ENCRYPTION's IV or SEC_RAND's seed, are unchanged
    added CAMELLIA256 and ARIA256 support to SEC_ENCRYPTION
  v1.3
    removed reserved space in settings block since specs don't really retain backwards/forwards support in that way
    changed format of SEC_IMAGETABLE entirely
      no longer uses 'frame|n|name' syntax for webp animations
      supports loading maps
    added CHACHA20 and BLOWFISH support to SEC_ENCRYPTION
  v1.4
    removed reserved space in SEC_TEXT flags
    added SEC_SHUFFLE
      shuffles written bits randomly to try to further obfuscate
    changed default pbkdf2 digest to sha512 and iterations to 1,000,000 (were sha1 and 100,000 respectively prior)
    changed format of SEC_ENCRYPTION entirely
      added fields for kdf before the algorithm
  v1.5
    added support for scrypt kdf in SEC_ENCRYPTION
    changed kdf field in SEC_ENCRYPTION from 2bit to 3bit

read(): read amount of data honoring any settings/arguments. Any overread is cached for the next read(s)
vlq(): read a uint using the given chunk size. Any overread is cached for the next read(s)
until(): typically, read(8bit) until bitmask is read
can be given an initial 32 bit seed (as base 62) to hide the header. any SEC_RAND after will override
Header part 1 (header mode and mode mask affect these):
  read(12bit): version
  read(6bit): mode
Header part 2 (global mode affects these, header mode mask affects settings but not section count):
  read(6bit): settings
  vlq(4): section count (max 511)
Data (global mode and mode mask affect these, unless a SEC_MODE and/or SEC_MODEMASK is in effect instead):
  loop over sections:
    read(9bit): section type. MSB is set to 1 to clear this section
    ...: section data (described below)
  end
Version:
  xxxxxx000000: 6 bit major version
  000000xxxxxx: 6 bit minor version
Mode:
  xxx000: 3 bit mode value for alpha pixels from constants table
  000xxx: 3 bit mode value for non-alpha pixels from constants table
  The default for both the header mode and global mode is MODE_A3BPP|MODE_3BPP
Settings:
  xxx000: modify where the alpha/non-alpha threshhold is
  000: default. alpha is any pixels where alpha < 255
  001: alpha is any pixel where alpha < 220
  010: alpha is any pixel where alpha < 184
  011: alpha is any pixel where alpha < 148
  100: alpha is any pixel where alpha < 112
  101: alpha is any pixel where alpha < 76
  110: alpha is any pixel where alpha < 40
  111: alpha is any pixel where alpha = 0
  000xxx: mode mask
Strings:
  loop until(00000000):
    read(8bit)
  end
Sections:
  SEC_FILE:
    vlq(8): file size
    read(string): file name
    read(8*size): file
  SEC_RAND:
    read(32bit): seed
    write buffer is flushed when setting, but not when clearing
  SEC_IMAGETABLE:
    vlq(4): number of images
    loop images:
      read(1bit): frame index flag
      read(1bit): map flag
      vlq(4): frame index (if flag is set)
      read(string): map file name (if flag is set)
      read(string): iamge file name
    end
    specify which files go to which images
    allows you to have a small "controller" image holding the headers and several images holding files
    use SEC_CURSOR to jump between images
  SEC_RECT:
    vlq(8)*4: x, y, width, height
    write buffer is flushed when setting, but not when clearing
  SEC_CURSOR:
    read(3bit): command
    vlq(4): image index (only when command == 2 or 3)
    vlq(8)*2: x, y (only when command == 2)
    commands
      0 push image,x,y
      1 pop image,x,y
      2 move to image,x,y
      3 move to image
    image is always 0 when SEC_IMAGETABLE isn't in use
    trying to save command 2 while global random or SEC_RAND is in effect will save as command 3 instead
    position is bounded to any active SEC_RECT, such that 0,0 is the top-left of the rect
  SEC_COMPRESSION:
    read(4bit): algorithm (from const table)
    toggle on/off running SEC_FILE through compression before packing
    GZIP:
      read(4bit): compression level (0-9)
    BROTLI:
      read(4bit): compression quality (0-11)
      read(1bit): text mode
  SEC_ENCRYPTION:
    read(3bit): kdf (from const table)
    read(1bit): advanced kdf settings
    if kdf is argon2i/argon2d/argon2id:
      read(128bit): salt
    if kdf is asym:
      read(256bit): encrypted key
    advanced settings:
      pbkdf2
        vlq(8): iterations
      argon2i/argon2d/argon2id:
        vlq(8): memory cost
        vlq(8): time cost
        vlq(8): parallelism
      scrypt:
        vlq(8): cpu/memory cost
        vlq(8): block size
        vlq(8): parallelization
    read(4bit): algorithm (from const table)
    AES256, CAMELLIA256, ARIA256, CHACHA20, BLOWFISH:
      read(128bit): IV
      AES256: AES-256-CBC
      CAMELLIA256: CAMELLIA-256-CBC
      ARIA256: ARIA-256-CBC
      CHACHA20: CHACHA20
      BLOWFISH: BF-CBC
      IV is auto-generated via cryto-safe PRNG
      use this IV (and user-supplied password) to run the SEC_FILE through (happens after SEC_COMPRESSION)
    if kdf is pbkdf2
      key is generated from password via pbkdf2 (sha512, default 1000000 iterations, unique per-version 32byte salt)
      salt can be overridden
    if kdf is argon2id
      key is generated from password via argon2id (defaults time cost 50, memory cost 65536, parallelism 8, unique per-version 32byte pepper)
    if kdf is scrypt
      key is generated from password via scrypt (defaults cost 16384, block size 8, parallelization 1, unique per-version 32byte salt)
    if kdf is asym
      when encrypting, the public key is used to encrypt + store a generated random key
      when decrypting, the private key is used to decrypt the stored key
  SEC_PARTIALFILE:
    vlq(8): file size
    read(string): file name
    vlq(4): file index
    declare a file stored in pieces
    file index is used to refer to it in the actual piece sections
  SEC_PARTIALFILEPIECE:
    vlq(4): file index
    vlq(4): piece index
    read(1bit): last piece flag
    vlq(8): piece size
    read(8*size): piece
    declare a piece of a file
    file index from the accompanying SEC_PARTIALFILE
    piece index is so the pieces can be stored in any arbitrary order
  SEC_MODE:
    read(6bit): mode
    override the global mode with this one until either another SEC_MODE is found or SEC_MODE is cleared
    write buffer is flushed when both setting and clearing
  SEC_ALPHA:
    read(3bit): alpha threshhold
    change the alpha threshhold from the global one until either another SEC_ALPHA is found or SEC_ALPHA is cleared
  SEC_TEXT:
    read(4bit): sec honor mask
    vlq(8): length
    read(8*length): data
    mask
      x0: honor SEC_COMPRESSION
      0x: honor SEC_ENCRYPTION
  SEC_MODEMASK:
    read(3bit): mode mask
    override the global mode mask with this one until either another SEC_MODEMASK is found or SEC_MODEMASK is cleared
    write buffer is flushed when both setting and clearing
  SEC_SHUFFLE:
    read(32bit): seed
    write buffer is flushed when setting, but not when clearing

