CHANGELOG:
  v1.1
    change SEC_ENCRYPTION to use pbkdf2 to generate key instead of md5 (see SEC_ENCRYPTION below for details)
    added SEC_MODEMASK
    added global mode mask to settings mask
    old mode mask behavior now known as the header mode mask
    bump SEC_IMAGETABLE and SEC_CURSOR indexs from 8bit to 16bit

read(): read amount of data honoring any settings/arguments. Any overread is cached for the next read(s)
until(): typically, read(8bit) until bitmask is read
can be given an initial 32 bit seed (as base 62) to hide the header. any SEC_RAND after will override
Header part 1 (header mode and mode mask affect these):
  read(12bit): version
  read(6bit): mode
Header part 2 (global mode affects these, header mode mask affects settings but not section count):
  read(14bit): settings
  read(9bit): section count (max 511)
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
  xxx00000000000: modify where the alpha/non-alpha threshhold is
  000: default. alpha is any pixels where alpha < 255
  001: alpha is any pixel where alpha < 220
  010: alpha is any pixel where alpha < 184
  011: alpha is any pixel where alpha < 148
  100: alpha is any pixel where alpha < 112
  101: alpha is any pixel where alpha < 76
  110: alpha is any pixel where alpha < 40
  111: alpha is any pixel where alpha = 0
  000xxx00000000: mode mask
  000000xxxxxxxx: reserved
Strings:
  loop until(00000000):
    read(8bit)
  end
Sections:
  SEC_FILE:
    read(24bit): file size
    read(string): file name
    read(8*size): file
  SEC_RAND:
    read(32bit): seed
    write buffer is flushed when setting, but not when clearing
  SEC_IMAGETABLE:
    read(16bit): number of images
    loop images:
      read(string): image file name
    end
    specify which files go to which images
    allows you to have a small "controller" image holding the headers and several images holding files
    use SEC_CURSOR to jump between images
  SEC_RECT:
    read(16bit*4): x, y, width, height
    write buffer is flushed when setting, but not when clearing
  SEC_CURSOR:
    read(3bit): command
    read(16bit): image index (only when command == 2 or 3)
    read(16bit*2): x, y (only when command == 2)
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
    read(4bit): algorithm (from const table)
    AES256:
      read(128bit): IV
      AES-256-CBC, IV is auto-generated via cryto-safe PRNG
      use this IV (and user-supplied password) to run the SEC_FILE through (happens after SEC_COMPRESSION)
      key is generated from password via pbkdf2 (sha1, 100000 iterations, unique per-version 32byte salt)
      salt can be overridden
  SEC_PARTIALFILE:
    read(24bit): file size
    read(string): file name
    read(8bit): file index
    declare a file stored in pieces
    file index is used to refer to it in the actual piece sections
  SEC_PARTIALFILEPIECE:
    read(8bit): file index
    read(8bit): piece index
    read(1bit): last piece flag
    read(24bit): piece size
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
    read(16bit): length
    read(8*length): data
    mask
      x000: honor SEC_COMPRESSION
      0x00: honor SEC_ENCRYPTION
      00xx: reserved
  SEC_MODEMASK:
    read(3bit): mode mask
    override the global mode mask with this one until either another SEC_MODEMASK is found or SEC_MODEMASK is cleared
    write buffer is flushed when both setting and clearing

