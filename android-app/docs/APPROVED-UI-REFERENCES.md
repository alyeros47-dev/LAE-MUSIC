# Approved Android UI references

The owner's clarification on November 18, 2026 takes precedence over the image upload order:

| Reference content | Uploaded file | Native experience |
| --- | --- | --- |
| Woman worshipping, full-height portrait | 1000226034.jpg | Discover — primary design |
| Featured-song banner, trending cards, recently played | 1000226035.jpg | Home |
| Categories, circular artist portraits, trending rows | 1000226036.jpg | Explore |

## Discover

One song per full-screen vertical pager position. Up moves forward; down moves back. Portrait artwork fills behind the transparent header, Discover/Explore tabs, right-side Follow/Like/Comment/Share/More rail, lower song information, slim playback/seek row and bottom navigation. Square covers retain their aspect ratio over a blurred version of the same artwork. The title precedes the artist name, with a genre chip and short description. Previous/next controls remain available in the song's More sheet and native Android media controls; swiping changes songs directly.

The approved existing LAE-MUSIC logo assets are reused. Artist verification badges, sample engagement numbers, notifications and audio waveforms from the references are not fabricated.

## Home

A separate page with a featured-song carousel, trending artwork cards, actual listening history and recommendations drawn from existing published songs. Editorial featured tracks are used when supplied by the backend; otherwise actual recent releases are presented. Recommendations prioritize genres from liked/recent songs and exclude recently heard tracks. No placeholder tracks or account history are created. Music playback stays on Home until the user chooses to return to Discover.

## Explore

Accessible through the top Explore tab in Discover. Category tiles come from actual catalogue genres. Circular artists use editorial selections where available, otherwise real catalogue artists. Trending rows and filtered search results use existing backend responses. No fictional categories, durations, profiles or engagement counts are inserted. Home releases and Explore search results are held separately so a category search does not replace Home's shelves.

## Shared navigation and preservation

Exactly Home | Discover | My Music | Downloads | Profile. A compact artwork/progress player remains on the browsing screens. All visible controls perform existing actions. The listening service, protected download implementation, accounts, backend, payments, subscriptions and royalty calculations are unchanged by this UI batch.

## Focused verification

Compile, unit/lint checks and Android emulator tests cover immersive artwork bounds, up/down swipes, social controls/counts, separate Home/Explore layouts, persistent playback while navigating, and screenshots of all three experiences. Existing native background and download/reboot checks provide a small regression check. Public screenshots use actual catalogue data with playback immediately paused to avoid creating a qualifying stream for a visual test.

Owner visual acceptance and physical-device testing remain release gates. Google Play purchase integration remains disabled and unfinished as documented in RELEASE-CHECKLIST.md.
