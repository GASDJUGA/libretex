# kpsewhich through a cache, for latexmk on Windows (written by JuTeX). A MiKTeX program
# takes about 0.2 s just to start, and latexmk asks kpsewhich for every .bib and .bst file
# on every run. Arguments: the cache file, the real kpsewhich, then kpsewhich's arguments.
# An answer is reused only while all its files still exist; anything else asks kpsewhich.
use strict;
use warnings;

my ($cache, $kpsewhich, @args) = @ARGV;
my $key = join "\x1f", $kpsewhich, @args;

my %answers;
if (open my $in, '<', $cache) {
    while (my $line = <$in>) {
        chomp $line;
        my ($k, @files) = split /\x1e/, $line;
        $answers{$k} = \@files if defined $k && @files;
    }
    close $in;
}

my $exists = sub { !grep { !-f } @_ };
my $cached = $answers{$key};
if ($cached && $exists->(@$cached)) {
    print "$_\n" for @$cached;
    exit 0;
}

my $command = join ' ', map { qq("$_") } $kpsewhich, @args;
my @files = map { s/\r?\n\z//r } `$command`;
my $status = $? >> 8;
print "$_\n" for @files;

if (@files && $exists->(@files)) {
    $answers{$key} = \@files;
    if (open my $out, '>', "$cache.tmp") {
        print $out join("\x1e", $_, @{ $answers{$_} }), "\n" for sort keys %answers;
        close $out;
        rename "$cache.tmp", $cache;
    }
}
exit $status;
