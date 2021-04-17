read(): read amount of data honoring any settings/arguments. Any overread is cached for the next read(s)
until(): typically, read(8bit) until bitmask is read
can be given an initial 32 bit seed (as base 62) to hide the header. any SEC_RAND after will override
Header part 1 (header mode affects these):
  read(12bit): version
  read(6bit): mode mask
Header part 2 (global mode affects these):
  read(14bit): settings mask
  read(9bit): section count (max 511)
Data (global mode affects these, unless a SEC_MODE is in effect instead):
  loop over sections:
    read(9bit): section type. MSB is set to 1 to clear this section
    ...: section data (described below)
  end
Version:
  xxxxxx000000: 6 bit major version
  000000xxxxxx: 6 bit minor version
Mode mask:
  xxx000: 3 bit mode value for alpha pixels from constants table
  000xxx: 3 bit mode value for non-alpha pixels from constants table
  The default for both the header mode and global mode is MODE_A3BPP|MODE_3BPP
Settings mask:
  xxx00000000000: modify where the alpha/non-alpha threshhold is
  000: default. alpha is any pixels where alpha < 255
  001: alpha is any pixel where alpha < 220
  010: alpha is any pixel where alpha < 184
  011: alpha is any pixel where alpha < 148
  100: alpha is any pixel where alpha < 112
  101: alpha is any pixel where alpha < 76
  110: alpha is any pixel where alpha < 40
  111: alpha is any pixel where alpha = 0
  000xxxxxxxxxxx: reserved
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
    read(8bit): number of images
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
    read(8bit): image index (only when command == 2 or 3)
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
      password is run through MD5 and passed directly in as key
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


input object to pack()
{
  verMajor: <version>, // defaults to VERSION_MAJOR const
  verMinor: <version>, // defaults to VERSION_MINOR const
  headmode: <mode>,
  headmodeMask: <mask>, // see modeMask
  mode: <mode>,
  modeMask: <mask>, // a 3-bit mask of which channels to use (RGB). A mask of 000 cannot be used unless MODE_32BPP is used as well
  secs: [
    {
      id: SEC_FILE,
      path: file path,
      compressed: <boolean> // if this file is already compressed so that SEC_COMPRESSION ignores it in packing
    },
    {
      id: SEC_RAND, // overrides global seed
      seed: <seed>
    },
    {
      id: SEC_IMAGETABLE,
      in: [], // array of input image paths
      out: [] // array of output image names
    },
    {
      id: SEC_RECT,
      x, y, w, h
    },
    {
      id: SEC_CURSOR,
      x, y, index
    },
    {
      id: SEC_COMPRESSION, // this gets applied *globally* to all files packed after being enabled
      type: <type>, // from const table
      level: <0-9> // if applicable. 0 uses whatever the default is for this type
    },
    {
      id: SEC_ENCRYPTION, // this gets applied *globally* to all files packed after being enabled
      type: <type>, // from const table
      pw: '' // password to use if applicable
    },
    {
      id: SEC_PARTIALFILE, // SEC_GZIP and SEC_AES, if enabled, get applied to the source file here
      path: file path,
      index: <n>, // file index
      compressed: <boolean> // if this file is already compressed so that SEC_COMPRESSION ignores it in packing
    },
    {
      id: SEC_PARTIALFILEPIECE,
      index: <n>, // the index used in the matching SEC_PARTIALFILE
      size: <n> // size of this piece. if omitted, it's set to the size of the remaining file
    },
    {
      id: SEC_MODE,
      mode: <mode> // override the global mode with this one until another SEC_MODE is set or SEC_MODE is cleared
    },
    {
      id: SEC_ALPHA,
      alpha: ... // change the alpha threshhold, see settings mask
    },
    {
      id: SEC_TEXT,
      text: <text>,
      honor: <honor mask>
    }
  ],
  alpha: ..., // optional, see settings mask for allowed values between 0-255
  rand: <seed>, // optional
  in: '', // input image path
  out: '', // output image path
}


input object to unpack()
{
  headmode: <mode>, // if needed
  headmodeMask: <mask>, // if needed
  image,
  rand: <seed>, // if needed
  pws: [ '', ... ] // if needed for SEC_ENCRYPTION. Shifted off the top and used in order for each SEC_ENCRYPTION encountered. Any missing result in a call to requestPassword
}

