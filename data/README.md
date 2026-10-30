# Data

`freq-it-v1.json`: the 20,000 most common Italian lemmas in fiction, with their word forms. Built by `tools/build-freq.mjs` from:

- 199 Italian novels from [Project Gutenberg](https://www.gutenberg.org) (public domain; ids in `tools/gutenberg-ids.txt`). Only counts derived from them are included.
- [Morph-it!](https://docs.sslmit.unibo.it/doku.php?id=resources:morph-it) by Marco Baroni and Eros Zanchetta, for word form → lemma.

Because the form → lemma mapping derives from Morph-it!, this file is licensed under the [Creative Commons Attribution-ShareAlike 2.0 License](https://creativecommons.org/licenses/by-sa/2.0/), like Morph-it! itself.
