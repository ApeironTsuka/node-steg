input object to pack()
{
  verMajor: <version>, // defaults to VERSION_MAJOR const
  verMinor: <version>, // defaults to VERSION_MINOR const
  headmode: <mode>,
  headmodeMask: <mask>, // see modeMask
  mode: <mode>,
  modeMask: <mask>, // a 3-bit mask of which channels to use (RGB). A mask of 000 cannot be used unless MODE_32BPP is used as well
  salt: <salt>, // hex string for the 32 byte salt, overriding the internal salt
  secs: [
    {
      id: SEC_FILE,
      path: file path,
      compressed: <boolean> // if this file is already compressed so that SEC_COMPRESSION ignores it in packing
    },
    {
      id: SEC_RAND, // overrides global rand seed
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
      kdf: <kdf>, // from const table
      adv: <true/false>, // if enabled, use the below advanced settings for the kdf
      memoryCost: <size in KiB>, // if adv = true and kdf is one of the Argon2 variants
      timeCost: <int>, // if adv = true and kdf is one of the Argon2 variants
      parallelism: <int>, // if adv = true and kdf is one of the Argon2 variants
      iterations: <int>, // if adv = true and kdf is pbkdf2
      pw: '' // password to use if applicable
    },
    {
      id: SEC_PARTIALFILE, // SEC_COMPRESSION and SEC_ENCRYPTION, if enabled, get applied to the source file here
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
      id: SEC_MODEMASK,
      mask: <mask> // override the global mode mask with this one until another SEC_MODEMASK is set or SEC_MODEMASK is cleared
    },
    {
      id: SEC_ALPHA,
      alpha: ... // change the alpha threshhold, see settings mask
    },
    {
      id: SEC_TEXT,
      text: <text>,
      honor: <honor mask>
    },
    {
      id: SEC_SHUFFLE, // overrides global shuffle seed
      seed: <seed>
    }
  ],
  alpha: ..., // optional, see settings mask for allowed values between 0-255
  rand: <seed>, // optional
  shuffle: <seed>, // optional
  x: <x>, y: <y>, // initial cursor position
  dryrun: <true/false>, // only do a dry run; don't save the images, don't compress/encrypt, don't write any files, only return success/failure
  dryrunComp: <true/false>, // requires dryrun; does a full dryrun by fully encrypting/compressing files and performing all of the normal actions short of the final image saving
  in: '', // input image path
  out: '', // output image path
  useBufs: <true/false> // use Buffer instead of temp file for compression/encryption
}


input object to unpack()
{
  headmode: <mode>, // if needed
  headmodeMask: <mask>, // if needed
  image,
  rand: <seed>, // if needed
  shuffle: <seed>, // if needed
  x: <x>, y: <y>, // initial cursor position
  pws: [ '', ... ], // if needed for SEC_ENCRYPTION. Shifted off the top and used in order for each SEC_ENCRYPTION encountered. Any missing result in a call to requestPassword
  salt: <salt>, // hex string for the 32 byte salt, overriding the internal salt
  useBufs: <true/false> // use Buffer instead of temp file for compression/encryption
}
