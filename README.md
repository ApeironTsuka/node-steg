# node-steg
### Usage
First import the CreateBuilder helper and constants. <br />
`import { consts, CreateBuilder } from 'node-steg';` <br />
You can also import `util` if you want to control how verbose it is for debugging purposes. <br />
`import { util } from 'node-steg';`

Now, lets create a builder. <br />
`let steg = CreateBuilder();` <br />
The arguments are `CreateBuilder([major version, [minor version]])`, if you want to use a specific version. <br />
At the time of writing, the default is v1.2.

For just packing a file in and calling it a day,

```javascript
steg.inputImage('path/to/input/image.ext')
    .outputImage('path/to/output/image2.ext')
    .addFile('path/to/file')
    .save();
```

And to extract it. If reusing the same `steg` object, `clear()` must be called.
```javascript
steg.clear()
    .inputImage('path/to/output/image2.ext')
    .load()
    .then((secs) => {
      // At this point, you're given a list of extractable items. If you don't care what's in it, or already know, there's a helper function for making it easier to extract everything
      return steg.extractAll(secs);
    })
    .then(() => console.log('Done'));
```
Supported image formats are PNG and WEBP (both static and animated). <br />
When it saves PNGs, it saves at compression 9 (highest). <br />
When it saves WEBPs, it saves as lossless+exact (save transparent pixels). <br />
For what I hope are obvious reasons, lossy formats can't work.

For animated WEBP images, the syntax is mostly the same. However, when both supplying paths for saving and loading (except for one exception below) you must provide them in the format `{ frame: <frame number, starting at 0>, path: <path> }`.
```javascript
steg.clear()
    .inputImage({ frame: 0, path: 'animated.webp')
    .outputImage('out.webp') // This is the one exception where you don't need the special format
    // do things as normal
    .save();

steg.clear()
    .inputImage({ frame: 0, path: 'out.webp')
    // etc
    .load()
    // etc
```
There are a number of storage modes available and can be applied separately for both alpha and non-alpha pixels. <br />
  3bpp: Stores 3 bits in the pixel, using the LSB of each of the RGB color channels <br />
  6bpp: Stores 6 bits using the lower 2 bits of each channel <br />
  9bpp: Ditto, but lower 3 bits <br />
  12bpp: Lower 4 <br />
  15bpp: Lower 5 <br />
  24bpp: Uses the full RGB values. This is handy if you don't care so much about the hiding but do want to use the storage <br />
  32bpp: This is a semi-special mode that forces overwriting the full RGBA data of every pixel. This is more implemented for completeness than anything.

There are also modifiers for what's considered alpha vs non-alpha, and which color channels to use if you want to leave one or more untouched.

Below is a full list of what the current steg builder can do. <br />
The term "out-of-band" is used to describe information that's needed but *not* stored in the image(s) and must be found by other means.

### Helper or utility

#### Path Objects
  Anywhere below where `path` is used, unless otherwise noted, can either be passed as a string or as the following object:<br />
  For image paths:<br />
```javascript
{
  path: <path string>, // if you're loading a file
  buffer: <Buffer object>, // if you're loading a Buffer
  name: <file name>, // if using a Buffer, it needs to know what name to refer to it as
  map: <map object>, // optional, described below
  map: <path string>, // for ease and consistency
  frame: <frame number, starts at 0> // optional, only used with animated WebP images
}
```
  For map paths:<br />
```javascript
{
  path: <path>, // if you're loading a file
  buffer: <Buffer object>, // if you're loading a Buffer
  buffer: true, // if you're saving to a Buffer
  name: <file name> // if using a Buffer, it needs to know what name to refer to it as
}
```

#### `clear()`
  Resets the object for re-use.

#### `dryrun(comp = false)`
  Switches to doing a dry run of the saving process. Everything is supported, but the `save()` call doesn't do the final saving. This does *not* create or modify any files. Any compression it would do is skipped and the full size is used instead. <br />
  Set `comp` to `true` to enable compression. This *does* create temporary files and runs files through compression (where applicable) as it would during the normal saving process.

#### `realrun()`
  Switches to doing a real run. This way, if a dry run succeeds, you can call this and do a proper run.

#### `keep(s = true)` (DEPRECATED)
  Toggle on/off keeping the image maps. This is only really useful when paired with `saveMap()`.

#### `setPasswords(pws)`
  This is an out-of-band setting. <br />
  More of a helper function. Pass it an array of passwords to pull from (in order) whenever it needs a password rather than prompting the user.

#### `cliPasswordHandler()`
  Asks the user for missing passwords via the command line and a silent 'Enter password:' prompt.

#### `setBufferMap(map)`
  Use `map`, a map of name/Buffer pairs, for images and maps.<br />
  Needed when using a Buffer for a map defined in an image table. Otherwise it's mainly for convenience.<br />
  Example: `steg.clear().setBufferMap({ 'image.png': pngBuffer, 'image.map': mapBuffer }).inputImage({ name: 'image.png', map: 'image.map' })...`<br />
  You can alternatively do `.inputImage({ name: 'image.png', buffer: pngBuffer, map: { name: 'image.map', buffer: mapBuffer } })` in the above example.

### Input/output

#### `inputImage(path)`
  The input image for both saving and loading. `path` is a _Path Object_. If a map is supplied, it's automatically loaded.

#### `outputImage(path)`
  The output image for saving. `path` is a _Path Object_. If a map is supplied, it's saved at the end.

#### `async save()`
  Saves the image(s).

#### `async load()`
  Parses the image(s) and returns a list of data sections (see _Classes_ section below).

#### `loadMap(name, path)` (DEPRECATED)
  Load `path` as the image map to use when saving/loading `name` rather than a default empty one. See `saveMap()` for more information.

#### `async saveMap(name, path)` (DEPRECATED)
  Save `name`'s input map to `path`. `name` is the filename+frame prefix if applicable but without any path sections, example: the file `tests/orig.png`'s map would require `name` to be `orig.png`. The map is the list of pixels that have been used internally. This can allow you to save multiple entire `Steg` instances on the same image without risking overwriting any by simply re-saving/loading the map after every time.

#### `async extractAll(secs = this.#secs, path = './extracted')`
  Extract all the sections in `secs` or, if null/undefined, extract all sections found, to the directory `path`.

#### `async getLoadOpts(packed = false, enc = false, salt = false, raw = false)`
  If `packed` is `false`, this returns the object representing the options required to load the current Steg instance (such as header mode, global seed, salt, etc).<br />
  If `packed` is `true`, it returns the object as a JSON string with byte 0 being a flag if it's encrypted.<br />
  If `enc` is also `true`, you'll be prompted for a password to use to encrypt via AES256 and a salt unique to this pair of functions.<br />
  If `salt` is `true`, it uses the current salt provided by .setSalt(), if any. `raw` is ignored.<br />
  If `raw` is `false`, then `salt` is a string that is hashed using SHA256.<br />
  If `raw` is `true`, then `salt` is a hex-encoded 32-byte value that is directly used as the salt.<br />
  Does NOT support generating a random salt, as the salt must be known.<br />
  Does not save passwords set by `setPasswords()`.

#### `async setLoadOpts(blob, packed = false, enc = false, salt = false, raw = false)`
  Loads the appropriate settings defined in `blob` into this `Steg` instance so that all that must be supplied are any passwords required and the input path before `load()` can be used. `packed`, `enc`, `salt`, and `raw` function the way they do with `getLoadOpts()`.

### Out-of-band

#### `setHeaderMode(mode)`
  This sets the mode used to store the first half of the header. It defaults to `MODE_A3BPP | MODE_3BPP`.

#### `setHeaderModeMask(mask)`
  This changes which channels are used to store the first half of the header. It defaults to `MODEMASK_RGB`.

#### `setGlobalSeed(seed)`
  This uses `seed` to randomly distribute the header and data around the image. It defaults to disabled.<br />
  `seed` is an arbitrary-length string consisting of a-z, A-Z, 0-9, and spaces.

#### `setInitialCursor(x, y)`
  This sets the cursor to x, y rather than the default 0, 0. Has no effect if a global seed is enabled.

#### `setSalt(salt, raw = false)`
  This overrides the internally-defined default salt when using encryption.<br />
  If `raw` is `false`, then `salt` is a string that is hashed using SHA256.<br />
  If `raw` is `true`, then `salt` is a hex-encoded 32-byte value that is directly used as the salt.<br />
  If `salt` is undefined, then a crypto-safe 32-byte PRNG value is generated and used. The downside to this last option is the only way to obtain the salt is via `getLoadOpts()`.

### Header

#### `setGlobalMode(mode)`
  This sets the mode used to store the second half of the header, as well as the rest of the data in general. It defaults to `MODE_A3BPP | MODE_3BPP`.

#### `setGlobalModeMask(mask)`
  This changes which channels are used to store the second half of the header, as well as the rest of the data in genereal. It defaults to `MODEMASK_RGB`.

#### `setGlobalAlphaBounds(bounds)`
  This changes what alpha value is considered alpha vs non-alpha. It supports 8 steps, each roughly 36 apart. Defaults to `ALPHA_255`.

### Sections

#### `setAlphaBounds(bounds)`
  This changes what alpha value is considered alpha vs non-alpha from what is set globally until another `setAlphaBounds()` is called or is cleared.

#### `clearAlphaBounds()`
  Removes the active `setAlphaBounds()` and returns the alpha value to the global one.

#### `setRect(x, y, width, height)`
  Bounds all operations within the defined rectangle until another `setRect()` called or is cleared.

#### `clearRect()`
  Removes the active `setRect()`.

#### `setMode(mode)`
  Override the global mode until another `setMode()` is called or is cleared.

#### `clearMode()`
  Reset the mode back to the global mode.

#### `setModeMask(mask)`
  Override the global mode mask until another `setModeMask()` is called or is cleared.

#### `clearModeMask()`
  Reset the mode mask back to the global mode mask.

#### `setSeed(seed)`
  Override the global seed until another `setSeed()` is called or is cleared.

#### `clearSeed()`
  Reset the seed back to the global seed. If there was no global seed, this disables the randomness.

#### `pushCursor()`/`popCursor()`
  Save/load the image index and x, y position of the cursor.

#### `moveCursor(x, y, index = 0)`
  Move the cursor to x, y in the current image or the one specified by `index`.

#### `moveImage(index = 0)`
  Move the cursor to the one specified by `index`. Doesn't touch the cursor position of the target image. Does nothing if `index` is already the current image.

#### `setImageTable(inputFiles, outputFiles)`
  This sets up a table of images you can jump around between with `moveCursor()`.<br />
  Both arguments are arrays and *must* be the same length.<br />
  Both `inputFiles` and `outputFiles` are arrays of _Path Objects_.
  It is, however, currently unsupported to mix anim and non-anim WEBP, or mix frames.<br />
  Example:<br />
    Each assuming `.inputImage({ frame: 0, path: 'in.webp' }).outputImage({ frame: 0, path: 'out.webp' })`
*    `.setImageTable([ { frame: 1, path: 'in.webp' } ], [ { frame: 1, path: 'out.webp' } ])`<br />
      This is valid.<br />
*    `.setImageTable([ { frame: 4, path: 'in.webp' } ], [ { frame: 1, path: 'out.webp' } ])`<br />
      This is unsupported. Frame indexes cannot be mismatched.<br />
*    `.setImageTable([ 'random.png' ], [ { frame: 1, path: 'out.webp' } ])`<br />
      This is also unsupported, as is using `random.webp` for the left side. Cannot mix animated and non-animated.<br />
*    `.setImageTable([ { frame: 1, path: 'in.webp' } ], [ 'random.webp' ])`<br />
      This is also unsupported. Doesn't matter which side, they cannot be mixed.<br />
*    `.setImageTable([ { frame: 2, path: 'in.webp' } ], [ { frame: 2, path: 'different.webp' } ])`<br />
      This is also unsupported, if 'in.webp' is already mapped to another output name.<br />
      In this case, it's trying to save frame 2 of 'in.webp' (which is already mapped to 'out.webp') to another file.<br />
      This technically works, but will result in 'out.webp' being duplicated as 'different.webp', rather than the frame copied over.<br />

  The short version is that it only supports modifying frames in the same animation, not replacing or extracting them. See `node-webpmux` or the official `webpmux` tool if you need that (I'd recommend `node-webpmux` as I've got a more-complete toolset than `webpmux` does in it).

#### `clearImageTable()`
  Disables the active table and moves the cursor back to the main image. Any images from any previously-active tables will still be written to properly.

#### `setCompression(type, level = 0, text = false)`
  Set the active compression algorithm to run files/text through. Currently, only `COMP_GZIP` and `COMP_BROTLI` are supported.<br />

  For GZIP:<br />
*    `level` must range 0 - 9
*    `text` is unused

  For BROTLI:<br />
*    `level` must range 0 - 11
*    `text` enables BROTLI's special text-mode compression

#### `clearCompression()`
  Clear an active `setCompression()`.

#### `setEncryption(type, pw)`
  Set the active encryption algorithm to run files/text through.<br />
  Currently supported algorithms:<br />
*  `CRYPT_AES256` (AES-256-CBC).
*  `CRYPT_CAMELLIA256` (CAMELLIA-256-CBC).
 * `CRYPT_ARIA256` (ARIA-256-CBC).

#### `clearEncryption()`
  Clear an active `setEncryption()`.

### Files/text

#### `addFile(path, name, compressed = false)`
  Add the file at `path` to the image under the name `name`.<br />
  Set `compressed` to `true` if the file is already compressed via the active compression mode.

#### `addDirectory(path, full = false, recursive = false, compressed = false)`
  Add the contents of the directory at `path` to the image. File names are preserved as-is and the basename of path is used as the base path. Example, `addDirectory('a/b/c')` will add the contents of that directory under `c/`.<br />
  Set `full` to `true` to add the path names as-is rather than the basename. Example, `addDirectory('a/b/c')` will then add the contents of that directory under `a/b/c/`.<br />
  Set `recursive` to `true` to recursively add any other directories under the path.<br />
  Set `compressed` to `true` if ALL files under `path` are already compressed via the active compression mode.

#### `addPartialFile(path, name, index, compressed = false)`
  Add the file at `path` you intend to store in pieces under the name `name` and index `index`.<br />
  Set `compressed` to `true` if the file is already compressed via the active compression mode.<br />
  `index` can be any integer 0 <= n <= 255 and is used solely for your own reference in `addPartialFilePiece()`.

#### `addPartialFilePiece(index, size = 0, last = false)`
  Add a piece of file `index`.<br />
  If `size` is 0 or greater than the remaining size of the file, the rest of the file is written and `last` is assumed `true`.<br />
  Set `last` to `true` to flag that this is the last piece you intend to write. You can use this if you don't intend to write the entire file.

#### `addText(text, honor = TEXT_HONOR_NONE)`
  Adds a simple block of text to the image. More simple than a text file.<br />
  `honor` is a mask of `TEXT_HONOR_ENCRYPTION` and `TEXT_HONOR_COMPRESSION` to control which, if any, are desired to apply to this text block.

### Classes

`StegFile`
*  `name`: Name of the file.
*  `size`: Size of the file as it was stored (after compression/encryption).
*  `realSize`: Uncompressed/decrypted size of the file (only computed *after* extracting).
*  `async extract(path = './extracted')`: Extract the file to `path`.

`StegPartialFile`
*  `name`: Name of the file.
*  `size`:  Size of the file as it was stored (after compression/encryption).
*  `realSize`: Uncompressed/decrypted size of the file (only computed *after* extracting).
*  `count`:  The number of pieces this file is in.
*  `async extract(path = './extracted')`: Extract the file to `path`.

`StegText`
*  `size`: Size of the text as it was stored (after compression/encryption).
*  `realSize`: Uncompressed/decrypted size of the text (only computed *after* extracting).
*  `async extract()`: Extracts and returns the text.

### Util

`util` has many things, but for controlling verbosity, only `util.Channels`, `util.debug`, and `util.setChannel()` are important.

#### `debug(v)`
  Set `v` to `true` to enable debug mode, `false` to disable it, or pass nothing to get the current debug state.<br />
  This mostly only disables the file extraction progress messages ("Saved x of size").<br />
  Does NOT set channel to `DEBUG`.

#### `Channels`
*  SILENT: Outputs nothing at all.
*  NORMAL: Default; Outputs basic information during saving/extracting, such as the number of pixels changed per image and extraction progress during exracting.
*  VERBOSE: Ouputs more detailed information about what it's doing to the image. Mostly useless.
*  VVERBOSE: Outputs even *more* information about what it's doing, but mostly during loading.
*  DEBUG: Outputs each and every modified pixel of every image it touches.

#### `setChannel(channel)`
  Sets the output channel to one of the above.

For a full (more technical) description of the format things are stored in the image(s), see the file `steg/specs/v<major>.<minor>.spec` (like `steg/specs/v1.2.spec`).<br />
Also see `test.mjs` for more examples in a very ugly file.

### Command-line tool

In `bin/` is `steg.mjs`. This is a somewhat simple CLI tool for packing/unpacking.

For packing:
*  `-pack` (must be first argument)<br />
    Set to packing mode.
*  `-silent`<br />
    Suppress all status and result output.
*  `-v`<br />
    Set to VERBOSE output. Outputs extra status messages.
*  `-vv`<br />
    Set to VVERBOSE output. Currently identical to `-v` as packing outputs nothing to the VVERBOSE channel.
*  `-debug`<br />
    Set to DEBUG output with debug mode enabled. Outputs everything `-vv` does, as well as every pixel modified.
*  `-version/-ver <version>`<br />
    Set the version wanted in the format `<major>.<minor>` like 1.2.
*  `-headmode/-hm <mode>`<br />
    Set the header mode in the format `[non-alpha]/[alpha]` like `9/24`. Values are the bits-per-pixel (3, 6, 9, 12, 15, 24, 32).
*  `-headmodemask/-hmm <mask>`<br />
    Set the header mode mask in the format `[r][g][b]` like `rb`.
*  `-mode/-m <mode>`<br />
    Set the global mode. Same format as `-headmode`.
*  `-modemask/-mm <mask>`<br />
    Set the global mode mask. Same format as `-headmodemask`.
*  `-salt <salt> [raw]`<br />
    Override the salt with the SHA256 hash of `<salt>`. If `[raw]` is provided, `<salt>` is considered raw.
*  `-alpha <threshhold>`<br />
    Set the global alpha threshhold where `<threshhold>` is a value between 0 and 7 inclusive.<br />
    The meanings are as follows:<br />
      0: alpha 255, 1: 220, 2: 184, 3: 148, 4: 112, 5: 76, 6: 40, 7: 0<br />
      This is in line with the `ALPHA_*` constants.
*  `-rand [seed]`<br />
    Set the global seed to the value of `[seed]` if provided, otherwise generate one to use.
*  `-dryrun [comp]`<br />
    Set to dryrun mode. If `[comp]` is set, compress files/text blocks during the dry run.
*  `-savemap <name> <path>` (DEPRECATED)<br />
    Save `<name>`'s map to `<path>`.
*  `-loadmap <name> <path>` (DEPRECATED)<br />
    Load `<name>`'s map from `<path>`.
*  `-in <path> [frame] [map]`<br />
    Use `<path>` as the input image.<br />
    If `[frame]` is provided, use that frame of `<path>`.<br />
    If `[map]` is provided, load and use `[map]` when loading `<path>`.
*  `-out <path> [frame] [map]`<br />
    Use `<path>` as the output image.<br />
    If `[frame]` is provided, use that frame of `<path>`.<br />
    If `[map]` is provided, save the map for `<path>` as `[map]`.
*  `-cursor <x> <y>`<br />
    Set the initial cursor to `<x>`, `<y>`.
*  `-getloadopts/-glo <path> [enc]`<br />
    Save the load opts to `<path>`. If `[enc]` is provided, encrypt the opts.
*  `-newsec/-ns <sec> <opts...>`<br />
    Define a new section.<br />
    <sec> and their options are defined below:<br />
*  *    `file <path> [name] [comp]`<br />
        Argument order is important.<br />
        Save `<path>` under the name `[name]` if provided, or the base filename if not.<br />
        If `[comp]` is provided, consider this file already compressed.
*  *   `dir <path> [full] [recurse] [comp]`<br />
        If `[full]` is provided, use the full pathname (minus `<path>`) as the file name. Otherwise use only the base file name.<br />
        If `[recurse]` is provided, add this directory recursively rather than only the files.<br />
        If `[comp]` is provided, consider all files to already be compressed.<br />
*  *   `rand [seed]`<br />
        Use the seed `[seed]` if provided, otherwise generate a new random seed to use.
*  *   `imagetable <in1> <out1> [<in2> <out2> [...]]`<br />
        Create an image table using the provided `<in>` `<out>` pairs.<br />
        Each `<in>` and `<out>` are in the format `[-frame <index>] [-map <map>] <path>`
*  *   `rect <x> <y> <w> <h>`<br />
        Limit to the rect defined by x, y, w, h.
*  *   `cursor <cmd> <args...>`<br />
        `<cmd>` is one of..<br />
          `push`: Push the cursor onto the stack<br />
          `pop`: Pop the cursor off of the stack and use it<br />
*  *   `move <x> <y> [index]`<br />
          Move the cursor to x, y of the image at `[index]` if provided, otherwise use the current image.<br />
*  *   `image [index]`<br />
         Move to the image at `[index]` and use whatever the cursor last was on it. Does nothing if `[index]` is the current image. If `[index]` isn't provided, it returns to the primary image.<br />
*  *   `compress <type> <args...>`<br />
        `<type>` can be one of..<br />
          `gzip <level>`: Use gzip. `<level>` is between 0 and 9.<br />
          `brotli <level> [text]`: Use Brotli. `<level>` is between 0 and 11. If `[text]` is provided, set Brotli into text compression mode.<br />
*  *   `encrypt <type>`<br />
        <type> can be one of..<br />
          `aes256`: Use AES 256.<br />
          `camellia256`: Use CAMELLIA 256.<br />
          `aria256`: Use ARIA 256.<br />
*  *   `partialfile <path> <index> [name] [comp]`<br />
        Define a file at `<path>` that is to be saved in discreet chunks. `<index>` is an arbitrary integer to use to refer to it in `partialfilepiece` blocks. If `[name]` is defined, use `[name]` as the filename rather than the base filename. If `[comp]` is provided, consider the file already compressed.
*  *   `partialfilepiece <index> <size> [final]`<br />
        Define a piece of the partial file `<index>` and of size `<size>` bytes. If `[final]` is provided, this is the final piece that is going to be defined and the file is considered complete.
*  *   `mode <mode>`<br />
        Set a new mode. `<mode>` is the same format as `-headmode`.
*  *   `modemask <mask>`<br />
        Set a new mode mask. `<mask>` is the same format as `-headmodemask`.
*  *   `alpha <threshhold>`<br />
        Set a new alpha threshhold. `<threshhold>` is the same format as `-alpha`.
*  *   `text <text> [honor]`<br />
        Save the text block `<text>`. If `[honor]` is defined, set whether compression/encryption should be honored. Format is `<encrypt/compress>[/<encrypt/compress>]` like `encrypt` or `compress/encrypt`.
*  `-clearsec/-cs <sec>`<br />
    Clear a section's effects.<br />
    Valid `<sec>` are defined below:
*  *   `rand`<br />
        Disable the seed. If a global seed was previously in effect, return to using it.
*  *   `imagetable`<br />
        Disable the image table. Any changes are kept and if a new table is defined using any of the previous images, their existing data is preserved.
*  *   `rect`<br />
        Disable the rect limitation and return to using the whole image's bounds.
*  *   `compress`<br />
        Disable compression.
*  *   `encrypt`<br />
        Disable encryption.
*  *   `mode`<br />
        Return to using the global mode.
*  *   `modemask`<br />
        Return to using the global mode mask.
*  *   `alpha`<br />
        Return to using the global alpha threshhold.
*  `-save`<br />
    Actually perform the actions defined. Omitting this is useful if you're only interested in using `-getloadopts`.

For unpacking:
*  `-unpack` (must be the first argument)<br />
    Set to unpacking mode.
*  `-silent`<br />
    Suppress all status and result output.
*  `-v`<br />
    Set to VERBOSE output. Outputs extra status messages.
*  `-vv`<br />
    Set to VVERBOSE output. Outputs everything `-v` does as well as what values were read.
*  `-debug`<br />
    Set to DEBUG output with debug mode enabled. Outputs everything `-vv` does, as well as the values of every pixel read.
*  `-headmode/-hm <mode>`<br />
    Same as `-headmode` of packing.
*  `-headmodemask/-hmm <mask>`<br />
    Same as `-headmodemask` of packing.
*  `-image <path>`<br />
    Use `<path>` as the input image.
*  `-rand [seed]`<br />
    Same as `-rand` of packing.
*  `-cursor <x> <y>`<br />
    Same as `-cursor` of packing.
*  `-loadmap <name> <path>` (DEPRECATED)<br />
    Load `<name>`'s map from `<path>`.
*  `-salt <salt> [raw]`<br />
    Same as `-salt` of packing.
*  `-setloadopts/-slo <path> [enc]`<br />
    Load the load opts from `<path>`. If `[enc]` is provided, then treat it as encrypted.
*  `-extract <path>`<br />
    Extract the contents to the directory `<path>` and print any text blocks in full.<br />
    Omitting this gives a summary of the contents and any text blocks under 100 bytes in size.
